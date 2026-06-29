#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# render-gateway.sh — render the parameterized Traefik config for an environment.
#
# ONE template set emits both dev and prod gateway config; the env picks the Host
# strings + ACME directory (LE-staging in dev, prod-LE in prod). Output goes to
# infra/gateway/rendered/ (gitignored) and is shipped to the droplet (RUNBOOK §4).
#
#   ENVIRONMENT=dev ./render-gateway.sh
#   ENVIRONMENT=prod ./render-gateway.sh        # reference; prod still on Jenkins
#
# Overridable env: VELDRIX_API_HOST VELDRIX_APP_HOST ACME_EMAIL ACME_CA_SERVER
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/rendered"

LE_STAGING="https://acme-staging-v02.api.letsencrypt.org/directory"
LE_PROD="https://acme-v02.api.letsencrypt.org/directory"

case "$ENVIRONMENT" in
  dev)
    export VELDRIX_API_HOST="${VELDRIX_API_HOST:-api.dev.veldrixai.ca}"
    export VELDRIX_APP_HOST="${VELDRIX_APP_HOST:-dev.veldrixai.ca}"
    export ACME_EMAIL="${ACME_EMAIL:-dev-admin@veldrixai.ca}"
    export ACME_CA_SERVER="${ACME_CA_SERVER:-$LE_STAGING}"
    ;;
  prod)
    export VELDRIX_API_HOST="${VELDRIX_API_HOST:-api.veldrixai.ca}"
    export VELDRIX_APP_HOST="${VELDRIX_APP_HOST:-app.veldrixai.ca}"
    export ACME_EMAIL="${ACME_EMAIL:-admin@veldrixai.ca}"
    export ACME_CA_SERVER="${ACME_CA_SERVER:-$LE_PROD}"
    ;;
  *)
    echo "ERROR: ENVIRONMENT must be dev or prod (got '$ENVIRONMENT')" >&2
    exit 1
    ;;
esac

command -v envsubst >/dev/null 2>&1 || {
  echo "ERROR: envsubst not found (install gettext)." >&2; exit 1; }

mkdir -p "$OUT/dynamic"

# Only substitute our known placeholders so nothing else in the YAML is touched.
envsubst '${ACME_EMAIL} ${ACME_CA_SERVER}' \
  < "$HERE/traefik.template.yml" > "$OUT/traefik.yml"
envsubst '${VELDRIX_API_HOST} ${VELDRIX_APP_HOST}' \
  < "$HERE/dynamic/routes.template.yml" > "$OUT/dynamic/routes.yml"

echo "Rendered gateway for ENVIRONMENT=$ENVIRONMENT:"
echo "  api host : $VELDRIX_API_HOST"
echo "  app host : $VELDRIX_APP_HOST"
echo "  acme     : $ACME_CA_SERVER"
echo "  output   : $OUT/{traefik.yml,dynamic/routes.yml}"

# Safety net: a rendered file with an unresolved placeholder would silently break
# routing — fail loudly instead.
if grep -RnE '\$\{[A-Z_]+\}' "$OUT" >/dev/null 2>&1; then
  echo "ERROR: unresolved \${...} placeholder remains in rendered output." >&2
  grep -RnE '\$\{[A-Z_]+\}' "$OUT" >&2 || true
  exit 1
fi
