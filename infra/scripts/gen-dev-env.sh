#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gen-dev-env.sh — fill .env.dev with freshly GENERATED dev-scoped secrets.
#
# Creates .env.dev from .env.dev.example (if missing) and replaces every
# REPLACE_WITH_* secret placeholder with a strong random value. All values are
# DEV-SCOPED throwaways — distinct from prod, safe to regenerate any time.
#
# .env.dev is GITIGNORED on purpose: never commit/push secret values. Both Windows
# and WSL2 are the same machine, so you don't need git to move it — see DEV_LOCAL.md.
#
#   bash infra/scripts/gen-dev-env.sh        # or: make dev-secrets
#
# Re-running regenerates ONLY still-placeholder fields by default; pass --force to
# overwrite ALL generated secrets (this rotates them — you'll need `make dev-reset`).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.dev"
EXAMPLE="$REPO_ROOT/.env.dev.example"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

[[ -f "$EXAMPLE" ]] || { echo "ERROR: $EXAMPLE not found" >&2; exit 1; }
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "Created .env.dev from the example."
fi

# Random generators (openssl is in WSL2 by default).
hex()    { openssl rand -hex "${1:-32}"; }                       # 0-9a-f
b64()    { openssl rand -base64 "${1:-32}"; }                    # std base64 (+/=)
fernet() { openssl rand -base64 32 | tr '+/' '-_'; }             # url-safe base64 = Fernet key

# set_secret KEY VALUE — replace `KEY=...` unless it already has a non-placeholder
# value (idempotent), or always when --force. `|` delimiter is safe: none of our
# generated charsets contain `|`.
set_secret() {
  local key="$1" val="$2" line cur
  line="$(grep -E "^${key}=" "$ENV_FILE" || true)"
  if [[ -z "$line" ]]; then echo "  (skip $key — not in template)"; return; fi
  cur="${line#*=}"
  if [[ "$FORCE" -eq 0 && -n "$cur" && "$cur" != REPLACE_WITH_* && "$cur" != sk_test_REPLACE* && "$cur" != pk_test_REPLACE* && "$cur" != whsec_REPLACE* ]]; then
    echo "  keep  $key (already set)"; return
  fi
  sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  echo "  set   $key"
}

echo "── Generating dev-scoped secrets into .env.dev ──"
set_secret JWT_SECRET_KEY            "$(hex 32)"
set_secret VELDRIX_INTERNAL_API_KEY  "$(hex 32)"
set_secret INTERNAL_SERVICE_TOKEN    "$(hex 32)"
set_secret VELDRIX_VAULT_KEY         "$(b64 32)"
set_secret STRIPE_CUSTOMER_HASH_KEY  "$(b64 32)"
set_secret CONNECTOR_ENCRYPTION_KEY  "$(fernet)"
set_secret POSTGRES_PASSWORD         "$(hex 16)"
set_secret GRAFANA_ADMIN_PASSWORD    "$(hex 12)"

echo
echo "✓ .env.dev secrets generated (gitignored — do NOT commit/push it)."
echo "  Stripe TEST keys + OAuth/Resend are left blank — fill them only if you need"
echo "  those features locally (the stack runs fully offline without them)."
echo "  Next: make dev-up"
