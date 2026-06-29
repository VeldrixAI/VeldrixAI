#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-dev.sh — parity + isolation verification for the VeldrixAI dev env.
#
# Asserts (Phase 5 §1.5 / acceptance checklist):
#   1. three services healthy on 8000/8001/8002 + frontend on 5000
#   2. Traefik TLS resolving for dev hosts (LE-STAGING chain, not prod)
#   3. dev DB/Redis provably NOT prod  ← the critical isolation check
#   4. migrations at expected version incl. 009/011 (delegates to check-drift.sh)
#   5. minimal synthetic seed present
#   6. chain-health green on seeded tenants
#   7. inference mode reports `stub`
#   8. frontend resolves to the dev API host, never prod
#
# Run on the droplet from /opt/veldrixai (has docker + the deployed .env), or set
# COMPOSE_FILE/ENV_FILE explicitly. Exits non-zero if ANY assertion fails.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/compose/docker-compose.deploy.yml}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/infra/compose/.env}"

DEV_API_HOST="${DEV_API_HOST:-api.dev.veldrixai.ca}"
DEV_APP_HOST="${DEV_APP_HOST:-dev.veldrixai.ca}"
PROD_API_HOST="api.veldrixai.ca"
PROD_APP_HOST="app.veldrixai.ca"

if [[ -f "$ENV_FILE" ]]; then source "$REPO_ROOT/infra/scripts/load-dotenv.sh"; load_dotenv "$ENV_FILE"; fi

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗ %s\033[0m\n' "$1"; fail=$((fail+1)); }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── 1. Service health ─────────────────────────────────────────────────────────
hdr "1. Service health (8000/8001/8002 + 5000)"
for svc in veldrix-auth:8000 veldrix-core:8001 veldrix-connectors:8002; do
  name="${svc%%:*}"; port="${svc##*:}"
  if dc exec -T "$name" curl -fsS "http://localhost:${port}/health" >/dev/null 2>&1; then
    ok "$name healthy on $port"
  else
    bad "$name NOT healthy on $port"
  fi
done
if dc exec -T veldrix-ui wget -q --spider "http://127.0.0.1:5000/" 2>/dev/null; then
  ok "veldrix-ui healthy on 5000"
else
  bad "veldrix-ui NOT healthy on 5000"
fi

# ── 2. TLS via Traefik — LE-STAGING chain (not prod) ─────────────────────────
hdr "2. Traefik TLS (dev hosts, LE-staging)"
for host in "$DEV_API_HOST" "$DEV_APP_HOST"; do
  # -k: staging certs aren't in the system trust store. We instead PROVE it's
  # staging by inspecting the issuer (LE staging intermediate says "(STAGING)").
  code="$(curl -ksS -o /dev/null -w '%{http_code}' "https://${host}/health" 2>/dev/null || echo 000)"
  issuer="$(echo | openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
            | openssl x509 -noout -issuer 2>/dev/null || true)"
  if [[ "$code" =~ ^(200|404|301|302)$ ]]; then
    ok "$host TLS responds (HTTP $code)"
  else
    bad "$host TLS did not respond (HTTP $code)"
  fi
  if echo "$issuer" | grep -qi "STAGING"; then
    ok "$host cert is Let's Encrypt STAGING (not prod LE)"
  else
    bad "$host cert issuer is NOT staging — got: ${issuer:-<none>}"
  fi
done

# ── 3. DB / Redis isolation — provably NOT prod (CRITICAL) ────────────────────
hdr "3. Data isolation — dev DB/Redis are provably NOT prod"
# 3a. The dev DB name must not be the prod default ('veldrix') and should be dev.
if [[ "${POSTGRES_DB:-}" == "veldrix" ]]; then
  bad "POSTGRES_DB is 'veldrix' (the PROD default) — dev must use a distinct DB"
elif [[ "${POSTGRES_DB:-}" == *dev* ]]; then
  ok "POSTGRES_DB='${POSTGRES_DB}' (distinct dev database)"
else
  bad "POSTGRES_DB='${POSTGRES_DB:-<unset>}' is neither prod nor an obvious dev DB — confirm"
fi
# 3b. No service connection string may reference a prod host.
leak=0
for name in veldrix-auth veldrix-core veldrix-connectors; do
  envdump="$(dc exec -T "$name" printenv 2>/dev/null || true)"
  if echo "$envdump" | grep -E 'DATABASE_URL|REDIS_URL' | grep -qE "${PROD_API_HOST}|@postgres-prod|veldrix-postgres[^-]"; then
    bad "$name has a DATABASE_URL/REDIS_URL referencing a prod host"
    leak=1
  fi
done
[[ "$leak" == 0 ]] && ok "no service DATABASE_URL/REDIS_URL references a prod host"
# 3c. The dev container set is namespaced (veldrix-${ENVIRONMENT}-*), separate
#     network + volumes — cannot collide with the prod stack's names.
if dc ps --format '{{.Name}}' 2>/dev/null | grep -q "veldrix-${ENVIRONMENT:-dev}-postgres"; then
  ok "dev postgres runs as isolated container veldrix-${ENVIRONMENT:-dev}-postgres"
else
  bad "expected isolated container veldrix-${ENVIRONMENT:-dev}-postgres not found"
fi

# ── 4. Migrations incl. 009/011 (drift surfaced, not papered over) ───────────
hdr "4. Migrations at expected version (009/011 + chain)"
if COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" bash "$REPO_ROOT/infra/db/check-drift.sh" >/tmp/drift.out 2>&1; then
  ok "009/010/011 objects present (see /tmp/drift.out)"
else
  bad "migration/drift check FAILED — see /tmp/drift.out"; sed 's/^/      /' /tmp/drift.out
fi

# ── 5. Synthetic seed present ─────────────────────────────────────────────────
hdr "5. Synthetic seed present"
cnt() { dc exec -T postgres psql -tAqX -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "$1" 2>/dev/null | tr -d '[:space:]'; }
users="$(cnt "SELECT count(*) FROM users WHERE email LIKE '%.test'")"
binds="$(cnt "SELECT count(*) FROM policy_active_bindings")"
audits="$(cnt "SELECT count(*) FROM audit_trails WHERE request_id LIKE 'seed-%'")"
[[ "${users:-0}" -ge 1 ]] && ok "synthetic users present ($users)" || bad "no synthetic .test users found"
[[ "${binds:-0}" -ge 1 ]] && ok "policy bindings present ($binds)" || bad "no policy_active_bindings found"
[[ "${audits:-0}" -ge 1 ]] && ok "synthetic audit rows present ($audits)" || bad "no seed audit rows found"
# Bindings must be default-safe shadow.
nonshadow="$(cnt "SELECT count(*) FROM policy_active_bindings WHERE policy_enforcement_mode <> 'shadow'")"
[[ "${nonshadow:-0}" == 0 ]] && ok "all seeded bindings are default-safe 'shadow'" || bad "$nonshadow binding(s) not in shadow mode"

# ── 6. Chain health green ─────────────────────────────────────────────────────
hdr "6. Audit chain-health green"
chain="$(dc exec -T veldrix-connectors curl -fsS -X POST \
  -H "X-Internal-Token: ${INTERNAL_SERVICE_TOKEN:-}" \
  "http://localhost:8002/api/audit-trails/internal/chain-health/refresh" 2>/dev/null || true)"
if echo "$chain" | grep -qE '"broken"[: ]*0\b'; then
  ok "all tenant chains intact (broken=0)"
else
  bad "chain-health not green or unreachable — response: ${chain:-<none>}"
fi

# ── 7. Inference mode = stub ──────────────────────────────────────────────────
hdr "7. Inference mode reports 'stub'"
mode="$(dc exec -T veldrix-core printenv VELDRIX_INFERENCE_MODE 2>/dev/null | tr -d '[:space:]')"
base="$(dc exec -T veldrix-core printenv NVIDIA_API_BASE_URL 2>/dev/null | tr -d '[:space:]')"
[[ "$mode" == "stub" ]] && ok "VELDRIX_INFERENCE_MODE=stub" || bad "VELDRIX_INFERENCE_MODE='${mode:-<unset>}' (expected stub)"
if echo "$base" | grep -q "mock-inference"; then
  ok "core inference base URL points at the deterministic stub"
else
  bad "NVIDIA_API_BASE_URL='${base:-<unset>}' does not point at mock-inference"
fi
if dc ps --status running --format '{{.Name}}' 2>/dev/null | grep -q "mock-inference"; then
  ok "mock-inference stub container running"
else
  bad "mock-inference stub container not running (start with --profile stub)"
fi

# ── 8. Frontend resolves to dev API, never prod ───────────────────────────────
hdr "8. Frontend points at dev API (drift-guard)"
ui_core="$(dc exec -T veldrix-ui printenv NEXT_PUBLIC_VELDRIX_CORE_API_URL 2>/dev/null | tr -d '[:space:]')"
if [[ "$ui_core" == "https://${DEV_API_HOST}" ]]; then
  ok "NEXT_PUBLIC_VELDRIX_CORE_API_URL=https://${DEV_API_HOST}"
else
  bad "NEXT_PUBLIC_VELDRIX_CORE_API_URL='${ui_core:-<unset>}' (expected https://${DEV_API_HOST})"
fi
if echo "$ui_core" | grep -qE "https://(${PROD_API_HOST}|${PROD_APP_HOST})$"; then
  bad "frontend is pointing at a PROD host — the veldrix-api.ts fallback may have fired"
else
  ok "frontend public API URL does not reference a prod host"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
hdr "Result: ${pass} passed, ${fail} failed"
if [[ "$fail" -gt 0 ]]; then
  echo "DEV ENVIRONMENT NOT VERIFIED — resolve the ✗ items above." >&2
  exit 1
fi
echo "✓ Dev environment verified: parity holds and isolation from prod is proven."
