#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-teardown.sh — stop the dev stack and remove its volumes (ON the droplet).
# This stops compose only. To release the droplet/DNS/Vercel (stop the meter),
# run `terraform destroy -var-file=environments/dev.tfvars` (APPLY-RUNBOOK §7).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REMOTE_DIR/infra/compose/docker-compose.deploy.yml}"
ENV_FILE="${ENV_FILE:-$REMOTE_DIR/.env}"
[[ -f "$ENV_FILE" ]] && { source "$REMOTE_DIR/infra/scripts/load-dotenv.sh"; load_dotenv "$ENV_FILE"; }

if [[ "${ENVIRONMENT:-dev}" != "dev" ]]; then
  echo "REFUSING: dev-teardown.sh only runs against ENVIRONMENT=dev (got '${ENVIRONMENT:-}')." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" --profile stub down -v
echo "✓ Dev stack stopped + volumes removed. Droplet still running —"
echo "  run 'terraform destroy -var-file=environments/dev.tfvars' to release cloud resources."
