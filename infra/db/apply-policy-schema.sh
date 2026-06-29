#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# apply-policy-schema.sh — create the policy-engine table that create_all() cannot.
#
# WHY: the connectors ORM registers a model for policy_active_bindings (011) but
# NOT for policy_documents (009) — see backend/connectors/src/modules/policy/models.py.
# So SQLAlchemy create_all() builds every other connectors table on boot, but never
# policy_documents. We apply ONLY 009 here (idempotent: CREATE TABLE/INDEX IF NOT
# EXISTS) to fill that one gap, so the seed + Policy Engine + check-drift have it.
#
# 009's `DEFAULT uuid_generate_v4()` needs the uuid-ossp extension, which the app
# never installs (its models use python-side uuid4), so we create it first.
#
#   COMPOSE_FILE=docker-compose.dev.yml ENV_FILE=.env.dev bash infra/db/apply-policy-schema.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.dev.yml}"
MIGRATION="$REPO_ROOT/backend/connectors/migrations/009_policy_engine.sql"

if [[ -n "${ENV_FILE:-}" && -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1091
  source "$REPO_ROOT/infra/scripts/load-dotenv.sh"
  load_dotenv "${ENV_FILE}"
fi
DB_USER="${POSTGRES_USER:-veldrix_dev}"
DB_NAME="${POSTGRES_DB:-veldrix_dev}"

psql_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "── Applying policy_documents schema (009 — no ORM model) to '$DB_NAME' ──"
psql_exec -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' >/dev/null
psql_exec < "$MIGRATION" >/dev/null
echo "✓ policy_documents + policy_active_bindings present (idempotent)."
