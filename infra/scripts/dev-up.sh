#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-up.sh — package + ship the dev stack to the droplet and bring it up.
# Runs LOCALLY. Mirrors prod's Jenkins scp+ssh deploy shape (RECON Finding 3).
#
#   DROPLET=<dev-droplet-ip> DEPLOY_ENV_FILE=infra/compose/.env.dev.deploy \
#     bash infra/scripts/dev-up.sh
#
# It does NOT create cloud resources (that's terraform apply, human-run). It
# assumes the droplet already exists (APPLY-RUNBOOK §3) and SSH works.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

: "${DROPLET:?set DROPLET=<dev droplet ip/host>}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$REPO_ROOT/infra/compose/.env.dev.deploy}"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/veldrixai}"
TARGET="${SSH_USER}@${DROPLET}"

[[ -f "$DEPLOY_ENV_FILE" ]] || { echo "ERROR: env file not found: $DEPLOY_ENV_FILE (copy .env.deploy.example)"; exit 1; }

echo "── 1/4 Render dev gateway config (LE-staging, dev hosts) ──"
ENVIRONMENT=dev bash "$REPO_ROOT/infra/gateway/render-gateway.sh"

echo "── 2/4 Ship files to ${TARGET}:${REMOTE_DIR} ──"
ssh "$TARGET" "mkdir -p ${REMOTE_DIR}/gateway ${REMOTE_DIR}/observability ${REMOTE_DIR}/seed ${REMOTE_DIR}/mock-inference ${REMOTE_DIR}/infra/db ${REMOTE_DIR}/infra/scripts"
scp "$REPO_ROOT/infra/compose/docker-compose.deploy.yml" "${TARGET}:${REMOTE_DIR}/"
scp "$DEPLOY_ENV_FILE"                                    "${TARGET}:${REMOTE_DIR}/.env"
scp -r "$REPO_ROOT/infra/gateway/rendered/traefik.yml"   "${TARGET}:${REMOTE_DIR}/gateway/traefik.yml"
scp -r "$REPO_ROOT/infra/gateway/rendered/dynamic"       "${TARGET}:${REMOTE_DIR}/gateway/dynamic"
scp -r "$REPO_ROOT/observability/."                      "${TARGET}:${REMOTE_DIR}/observability/"
scp -r "$REPO_ROOT/infra/seed/."                         "${TARGET}:${REMOTE_DIR}/seed/"
scp -r "$REPO_ROOT/infra/mock-inference/."               "${TARGET}:${REMOTE_DIR}/mock-inference/"
scp -r "$REPO_ROOT/infra/db/."                           "${TARGET}:${REMOTE_DIR}/infra/db/"
scp -r "$REPO_ROOT/infra/scripts/."                      "${TARGET}:${REMOTE_DIR}/infra/scripts/"
# Migrations (the canonical .sql set the bootstrap applies).
ssh "$TARGET" "mkdir -p ${REMOTE_DIR}/backend/connectors/migrations"
scp -r "$REPO_ROOT/backend/connectors/migrations/." "${TARGET}:${REMOTE_DIR}/backend/connectors/migrations/"

echo "── 3/4 Pull + start (stub profile = deterministic inference) ──"
ssh "$TARGET" "cd ${REMOTE_DIR} && docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml --profile stub up -d"

echo "── 4/4 Wait for postgres, apply migrations, seed ──"
ssh "$TARGET" "cd ${REMOTE_DIR} && sleep 8 && ENV_FILE=.env bash infra/db/bootstrap-migrations.sh"
ssh "$TARGET" "cd ${REMOTE_DIR} && docker compose -f docker-compose.deploy.yml exec -T veldrix-connectors python /seed/seed_dev.py"

echo
echo "✓ Dev stack deployed. Verify with:"
echo "    ssh ${TARGET} 'cd ${REMOTE_DIR} && DEV_API_HOST=api.dev.veldrixai.ca DEV_APP_HOST=dev.veldrixai.ca bash infra/scripts/verify-dev.sh'"
