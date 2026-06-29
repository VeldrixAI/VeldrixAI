#!/usr/bin/env bash
# run-seed.sh — (re)apply the synthetic seed. Runs ON the droplet (/opt/veldrixai).
# Idempotent: re-running resets dev to the same known state (seed_dev.py guards
# every row), without forking the audit hash chain.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$HERE/../compose/docker-compose.deploy.yml}"
docker compose -f "$COMPOSE_FILE" exec -T veldrix-connectors python /seed/seed_dev.py
