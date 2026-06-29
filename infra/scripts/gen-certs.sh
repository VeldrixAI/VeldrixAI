#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gen-certs.sh — generate a locally-TRUSTED self-signed cert for the dev hosts.
#
# Uses mkcert (locked decision: locally trusted, not browser-untrusted). On first
# run, `mkcert -install` adds mkcert's local CA to the system + browser trust
# stores, so https://dev.veldrixai.ca shows a GREEN lock with no -k needed.
#
# Output (gitignored — *.pem/*.key): gateway/local/certs/dev-cert.pem + dev-key.pem
# The cert covers BOTH dev hostnames as SANs plus localhost.
#
#   bash infra/scripts/gen-certs.sh           # or: make dev-certs
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
CERT_DIR="$REPO_ROOT/gateway/local/certs"

if ! command -v mkcert >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: mkcert not found. Install it inside WSL2:
  sudo apt-get update && sudo apt-get install -y libnss3-tools
  curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
  chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
Then re-run: make dev-certs
EOF
  exit 1
fi

mkdir -p "$CERT_DIR"

echo "── Installing mkcert local CA (idempotent; trusts the dev cert system-wide) ──"
mkcert -install

echo "── Issuing dev cert (SANs: dev + api.dev hosts, localhost, 127.0.0.1) ──"
mkcert \
  -cert-file "$CERT_DIR/dev-cert.pem" \
  -key-file  "$CERT_DIR/dev-key.pem" \
  dev.veldrixai.ca api.dev.veldrixai.ca "*.dev.veldrixai.ca" localhost 127.0.0.1

echo
echo "✓ Wrote $CERT_DIR/{dev-cert.pem,dev-key.pem} (gitignored)."
echo "  Traefik serves these via gateway/local/dynamic/tls.yml. Reload: make dev-up"
