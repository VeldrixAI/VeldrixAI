#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-reset.sh — wipe the dev data layer and rebuild to a clean known state.
# Runs ON the droplet (/opt/veldrixai). DESTROYS the dev DB/redis/cert volumes
# (dev only — names are veldrix-${ENVIRONMENT}-* so prod is never touched).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REMOTE_DIR/infra/compose/docker-compose.deploy.yml}"
ENV_FILE="${ENV_FILE:-$REMOTE_DIR/.env}"
[[ -f "$ENV_FILE" ]] && { source "$REMOTE_DIR/infra/scripts/load-dotenv.sh"; load_dotenv "$ENV_FILE"; }

if [[ "${ENVIRONMENT:-dev}" != "dev" ]]; then
  echo "REFUSING: dev-reset.sh only runs against ENVIRONMENT=dev (got '${ENVIRONMENT:-}')." >&2
  exit 1
fi

echo "── Stopping stack and REMOVING dev volumes (data wipe) ──"
docker compose -f "$COMPOSE_FILE" --profile stub down -v

echo "── Restarting clean stack ──"
docker compose -f "$COMPOSE_FILE" --profile stub up -d
sleep 8

echo "── Re-applying migrations (009/011) + seed ──"
ENV_FILE="$ENV_FILE" bash "$REMOTE_DIR/infra/db/bootstrap-migrations.sh"
docker compose -f "$COMPOSE_FILE" exec -T veldrix-connectors python /seed/seed_dev.py

echo "✓ Dev reset complete. Run infra/scripts/verify-dev.sh to confirm."
