# VeldrixAI — Configuration Reference

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, on-call
> Templates: `backend/.env.example` (shared), `backend/.env.dev.example` (dev), `backend/core/.env.production.example` (prod core), root `.env.example`

## Core service — model matrix & determinism

### Per-pillar model matrix (canonical pattern)

```
VELDRIX_PILLAR_MODEL__{PILLAR}__{FIELD}
PILLAR ∈ SAFETY | HALLUCINATION | BIAS | PROMPT_SECURITY | COMPLIANCE
FIELD  ∈ PRIMARY | FALLBACK | GROQ | TEMPERATURE | TOP_P | SEED | MAX_TOKENS | TIMEOUT_SECONDS
```

Defaults (code, `pillar_models.py`): five distinct heavyweight primaries — see the *Model Matrix* page. Example override:

```
VELDRIX_PILLAR_MODEL__HALLUCINATION__PRIMARY=nvidia/nemotron-3-ultra-550b-a55b
VELDRIX_PILLAR_MODEL__HALLUCINATION__TIMEOUT_SECONDS=30
```

> ⚠️ The legacy `VELDRIX_PILLAR_CONTENT_MODEL` / `…_HALLUCINATION_MODEL` / `…_BIAS_MODEL` / `…_POLICY_MODEL` / `…_LEGAL_MODEL` variables are **intentionally ignored** by core. Remove them from env files. (`VELDRIX_NIM_TIMEOUT_MS` is still used — by **connectors**, for prompt/PDF generation.)

### Determinism & routing

| Variable | Default | Meaning |
|---|---|---|
| `VELDRIX_DETERMINISTIC_ROUTING` | `true` | Strict provider priority order; disables the speculative race. Read at call time. |
| `VELDRIX_SPECULATIVE_EXECUTION` | `true` | Only takes effect when deterministic routing is `false`: race primary vs fallback provider, first response wins. |
| `VELDRIX_INFERENCE_SEED` | `42` | Sampling seed applied to every pillar call (per-pillar `SEED` overrides). |
| `VELDRIX_PROBE_TIMEOUT_S` / `VELDRIX_FALLBACK_TIMEOUT_S` | `2.0` / `1.5` | Race-mode probe budgets (speculative mode only). |
| `VELDRIX_MAX_INPUT_CHARS` | `2000` | Input truncation (first-half + last-half). |
| `VELDRIX_PILLAR_LATENCY_SLA_MS` | `10000` | Per-pillar latency logging threshold (error above, warn above 60%). |

### Inference providers (priority order; provider active only when its credential is set)

| Variable | Provider | Notes |
|---|---|---|
| `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`, `NVIDIA_MODEL_ID`, `NVIDIA_TIMEOUT_S` | 1 — NVIDIA NIM | Base URL default `https://integrate.api.nvidia.com/v1`; timeout default 4 s (pillar timeouts override per request) |
| `GROQ_API_KEY`, `GROQ_MODEL_ID`, `GROQ_TIMEOUT_S` | 2 — Groq | Model default `llama-3.3-70b-versatile`; timeout 3 s |
| `BEDROCK_PROXY_URL`, `BEDROCK_API_KEY`, `BEDROCK_MODEL_ID` | 3 — AWS Bedrock | OpenAI-compatible proxy required |
| `OSS_INFERENCE_URL`, `OSS_API_KEY`, `OSS_MODEL_ID` | 4 — OSS local | vLLM / Ollama, air-gapped deployments |

### Circuit breaker

| Variable | Default | Meaning |
|---|---|---|
| `CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures before a provider's breaker trips OPEN |
| `CIRCUIT_RECOVERY_TIMEOUT` | `60` | Seconds before HALF_OPEN probing |
| `CIRCUIT_HALF_OPEN_SUCCESS_REQUIRED` | `2` | Successes to close again |
| `CIRCUIT_BREAKER_BACKEND` | `memory` | `memory` or `redis` (multi-replica) |
| `CIRCUIT_BREAKER_REDIS_KEY_PREFIX` | `veldrix:cb` | Redis key prefix |
| `CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES` | `5` | Redis-backend fallback threshold |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection |

## Policy Engine runtime

| Variable | Default | Meaning |
|---|---|---|
| `POLICY_EVAL_BUDGET_MS` | `250` | Wall-clock budget for signal collection (overrun → partial signals, fail closed for high/critical) |
| `POLICY_MAX_CONCURRENT_EVALS` | `64` | Backpressure bound; surplus is shed |
| `POLICY_BACKPRESSURE_WAIT_MS` | `50` | Wait for a slot before shedding |
| `POLICY_MODE_CACHE_TTL_S` | `5` | Enforcement-mode cache TTL — bounds rollback propagation time |

## Phase 6 shadow integration (core; read at request time)

| Variable | Default | Meaning |
|---|---|---|
| `ENGINE_SHADOW_ENABLED` | `false` | Global kill switch |
| `ENGINE_SHADOW_SAMPLE_PCT` | `0` | Traffic sample 0–100 |
| `ENGINE_SHADOW_POOL_MAX_CONNECTIONS` | `5` | Dedicated worker HTTP pool ceiling |
| `ENGINE_SHADOW_POOL_ACQUIRE_TIMEOUT_S` | `0.25` | Pool acquire timeout (fast shed) |
| `ENGINE_SHADOW_MODE_CACHE_TTL_S` | `5` | Tenant-mode cache TTL for the shadow worker |

## Internal service auth (do not confuse these two)

| Variable | Direction | Meaning |
|---|---|---|
| `INTERNAL_SERVICE_TOKEN` | core → connectors (`X-Internal-Token`) | Required for audit writes and enforcement-mode mutations. Unset in connectors ⇒ mode changes disabled (503). |
| `VELDRIX_INTERNAL_API_KEY` | inbound → core | Core's own internal API key. **Not** the audit-write token. |
| `VELDRIX_AUTH_URL` / `VELDRIX_CONNECTORS_URL` | service discovery | Defaults `http://localhost:8000` / `:8002` in dev |

## Platform (auth / connectors / shared)

| Variable | Service | Meaning |
|---|---|---|
| `DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB` | auth, connectors | PostgreSQL connection |
| `JWT_SECRET_KEY`, `JWT_ALGORITHM` (HS256), `ACCESS_TOKEN_EXPIRE_MINUTES` (60) | all | JWT config (same secret across services) |
| `VELDRIX_VAULT_KEY` | auth, connectors | Base64 32-byte AES-256-GCM key. Generate: `python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | auth | Billing |
| `VELDRIX_UI_URL` | auth | Frontend URL for redirects |
| `VELDRIX_NIM_TIMEOUT_MS` | connectors | `8000` — NIM call timeout for prompt/PDF generation (still active; not a core pillar var) |
| `APP_ENV` | all | `development` / `production` |
| `ACME_EMAIL` | traefik | Let's Encrypt |

## Secrets handling rules

- Never commit real keys; `.env` files are git-ignored, templates (`*.example`) are committed.
- Production secrets live at `/opt/veldrixai/secrets/*.env`, chmod 600, environment-injected (never baked into images).
- Rotate `INTERNAL_SERVICE_TOKEN`, `JWT_SECRET_KEY`, and `VELDRIX_VAULT_KEY` via a secrets manager in production.
