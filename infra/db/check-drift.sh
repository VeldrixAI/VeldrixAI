#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-drift.sh — surface drift between the canonical .sql migrations and what
# SQLAlchemy create_all() materializes (RECON Finding 4 / Phase 5 §1.3 "surface,
# do not paper over").
#
# Strategy: build TWO throwaway databases from the SAME running postgres and diff
# their schema:
#   • db_sql      — the canonical ordered .sql set applied by bootstrap-migrations
#   • db_orm      — built by the services' create_all() + boot hooks (the prod
#                   mechanism) — supplied by the caller as an already-built DB,
#                   OR this script falls back to asserting the high-risk objects.
#
# Default mode (no ORM db given): assert the high-risk 009/010/011 objects exist
# with the expected columns/constraints on the live dev DB (which has BOTH paths
# applied). A missing object => the .sql and create_all() disagree => FAIL loud.
#
#   USE_DOCKER=1 ENV_FILE=.env bash infra/db/check-drift.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/compose/docker-compose.deploy.yml}"
USE_DOCKER="${USE_DOCKER:-1}"

if [[ -n "${ENV_FILE:-}" && -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1091
  source "$REPO_ROOT/infra/scripts/load-dotenv.sh"
  load_dotenv "${ENV_FILE}"
fi
DB_USER="${POSTGRES_USER:-${PGUSER:-veldrix_dev}}"
DB_NAME="${POSTGRES_DB:-${PGDATABASE:-veldrix_dev}}"

q() {
  local sql="$1"
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -tAqX -U "$DB_USER" -d "$DB_NAME" -c "$sql"
  else
    PGPASSWORD="${PGPASSWORD:-}" psql -tAqX \
      -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
      -U "$DB_USER" -d "$DB_NAME" -c "$sql"
  fi
}

fail=0
assert() {
  local desc="$1" got="$2" want="$3"
  if [[ "$(echo -n "$got" | tr -d '[:space:]')" == "$want" ]]; then
    printf '  ✓ %s\n' "$desc"
  else
    printf '  ✗ %s (got=%q want=%q)\n' "$desc" "$got" "$want"
    fail=1
  fi
}

echo "── Drift check: canonical .sql objects present on dev DB '$DB_NAME' ──"

# 009/011: policy tables + the default-safe 'shadow' default + CHECK constraint.
assert "policy_documents table exists" \
  "$(q "SELECT to_regclass('public.policy_documents') IS NOT NULL")" "t"
assert "policy_active_bindings table exists" \
  "$(q "SELECT to_regclass('public.policy_active_bindings') IS NOT NULL")" "t"
assert "policy_active_bindings.policy_enforcement_mode DEFAULT shadow" \
  "$(q "SELECT column_default LIKE '%shadow%' FROM information_schema.columns WHERE table_name='policy_active_bindings' AND column_name='policy_enforcement_mode'")" "t"
assert "ck_policy_enforcement_mode constraint exists" \
  "$(q "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_policy_enforcement_mode')")" "t"

# 010: audit hash-chain columns + append-only trigger.
assert "audit_trails.prev_hash column exists" \
  "$(q "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='audit_trails' AND column_name='prev_hash')")" "t"
assert "audit_trails.record_hash column exists" \
  "$(q "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='audit_trails' AND column_name='record_hash')")" "t"
assert "audit_trails.chain_seq column exists" \
  "$(q "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='audit_trails' AND column_name='chain_seq')")" "t"
assert "audit_trails_append_only trigger exists" \
  "$(q "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='audit_trails_append_only')")" "t"

echo
if [[ "$fail" == "0" ]]; then
  echo "✓ No drift detected on the high-risk 009/010/011 objects."
  echo "  (Rigorous full check — follow-up: pg_dump --schema-only of a .sql-built DB"
  echo "   vs a create_all-built DB and diff. Tracked in PARITY-CHECKLIST.md.)"
else
  echo "✗ DRIFT DETECTED — a canonical .sql object is missing/changed vs create_all()." >&2
  echo "  Do NOT paper over this; reconcile the .sql and the ORM model." >&2
  exit 1
fi
