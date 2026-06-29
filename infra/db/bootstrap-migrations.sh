#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# bootstrap-migrations.sh — apply the FULL ordered .sql migration set, incl. the
# never-auto-run 009_policy_engine and 011_enforcement_mode_rollout, to the dev DB.
#
# WHY (RECON Finding 4): connectors has NO generic .sql runner. Prod schema comes
# from SQLAlchemy create_all() + per-service _run_migrations() boot hooks; the
# numbered .sql files are the canonical, human-reviewable form — and 009/011 are
# materialized in prod ONLY via the ORM model's create_all(), never as .sql.
#
# This script is the FIRST end-to-end proof that the canonical ordered .sql set
# (incl. 009/011) applies cleanly on a fresh schema. It does NOT invent a parallel
# mechanism: it applies the SAME canonical files an operator would `psql -f` by
# hand, in order, idempotently (every file is IF NOT EXISTS / additive).
#
# Run order in the bringup: start postgres -> THIS -> start services (create_all +
# boot hooks run idempotently on top) -> seed. See DEV_ENVIRONMENT.md.
#
# Usage (on the droplet, from /opt/veldrixai):
#   ENV_FILE=.env bash infra/db/bootstrap-migrations.sh
# Or against a tunneled dev DB:
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=veldrix_dev PGDATABASE=veldrix_dev \
#     PGPASSWORD=*** USE_DOCKER=0 bash infra/db/bootstrap-migrations.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$REPO_ROOT/backend/connectors/migrations}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/compose/docker-compose.deploy.yml}"
USE_DOCKER="${USE_DOCKER:-1}"   # 1 = docker compose exec postgres; 0 = local psql

# 000_full_schema is a CONSOLIDATED, idempotent BASELINE that already folds in
# 001-007 (report_status, the trust_evaluation enum value, soft-delete, saved_prompts,
# report naming, audit intelligence/idempotency). Re-applying 001-007 on top
# double-creates — their `CREATE TYPE` is unguarded — and fails ("type ... already
# exists"). So the canonical fresh-DB sequence is the baseline + the POST-baseline
# ADDITIVE migrations only: 008 (pillar-label table / audit indexes) + 009/010/011
# (all IF NOT EXISTS-guarded). 008 ships as TWO files — both apply.
#
# NOTE: prod does not run any of these .sql files — it builds the schema via
# SQLAlchemy create_all() + the connectors _run_migrations() boot hook. This script
# is the OPTIONAL canonical-.sql artifact path (run once on a fresh DB).
ORDER=(
  000_full_schema
  008_add_pillar_labels
  008_audit_lookup_optimization
  009_policy_engine
  010_audit_hash_chain
  011_enforcement_mode_rollout
)

# Load DB creds from an env file if given (POSTGRES_USER / POSTGRES_DB).
# Use the safe loader — a .env may have spaces/quotes that break `source`.
if [[ -n "${ENV_FILE:-}" && -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1091
  source "$REPO_ROOT/infra/scripts/load-dotenv.sh"
  load_dotenv "${ENV_FILE}"
fi
DB_USER="${POSTGRES_USER:-${PGUSER:-veldrix_dev}}"
DB_NAME="${POSTGRES_DB:-${PGDATABASE:-veldrix_dev}}"

run_psql() {
  # Apply a single .sql file, aborting the whole run on the first error.
  local file="$1"
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$file"
  else
    PGPASSWORD="${PGPASSWORD:-}" psql -v ON_ERROR_STOP=1 \
      -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
      -U "$DB_USER" -d "$DB_NAME" -f "$file"
  fi
}

echo "── Applying canonical ordered migration set to dev DB '$DB_NAME' ──"
echo "   migrations: $MIGRATIONS_DIR"
echo "   mechanism : $([[ "$USE_DOCKER" == 1 ]] && echo 'docker compose exec postgres psql' || echo 'local psql')"
echo

for name in "${ORDER[@]}"; do
  file="$MIGRATIONS_DIR/${name}.sql"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing migration file: $file" >&2
    exit 1
  fi
  printf '  → %-38s ' "$name"
  run_psql "$file" >/dev/null
  echo "ok"
done

echo
echo "✓ Full ordered set applied (incl. 009_policy_engine + 011_enforcement_mode_rollout)."
echo "  Next: start the services (create_all + boot hooks run idempotently on top),"
echo "  then run the synthetic seed. Verify with infra/scripts/verify-dev.sh."
