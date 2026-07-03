# VeldrixAI — System Architecture

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering

## Topology

```
Internet (HTTPS :443)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ TRAEFIK API GATEWAY  (:80 → :443 redirect, :8080 admin)   │
│  · TLS 1.3 termination (Let's Encrypt)                     │
│  · Rate limiting: 100 req/min per IP                       │
│  · Path-based routing:                                     │
│      /auth/* /api-keys/* /billing/*  → Auth      (:8000)   │
│      /api/v1/*                       → Core      (:8001)   │
│      /api/analytics /api/prompts …   → Connectors(:8002)   │
│      /*                              → Frontend  (:5000)   │
└──────────┬──────────────────┬──────────────────┬──────────┘
           ▼                  ▼                  ▼
   AUTH SERVICE (2×)   CORE SERVICE (2×)   CONNECTORS (1×)
   FastAPI :8000       FastAPI :8001       FastAPI :8002
   · JWT (bcrypt)      · 5-pillar engine   · Analytics
   · API keys          · Inference router  · Reports (PDF)
   · Stripe billing    · Policy Engine     · Prompt library
   · AES-256 vault     · WebSocket/SSE     · Audit hash chain
           │                  │                  │
           └────────┬─────────┴─────────┬───────┘
                    ▼                   ▼
              REDIS (:6379)       POSTGRESQL (:5432)
              DB0 sessions/JWT    users, api_keys,
              DB1 cache + CB      reports, audit_trails,
              DB2 async queues    policy_documents, …

              PROMETHEUS (:9090) ──► GRAFANA (:3001)
```

## Services

### Auth Service (port 8000)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | User registration |
| `/auth/login` | POST | JWT token issuance |
| `/auth/me` | GET | Current user profile |
| `/api-keys` | GET, POST | API key management (`vx-live-…` prefix, bcrypt-hashed) |
| `/billing/status` | GET | Subscription status |
| `/billing/checkout` | POST | Stripe checkout session |

### Core Service (port 8001) — the engine
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/evaluate` | POST | Trust evaluation (five pillars, composite score) |
| `/api/v1/analyze` | POST | Detailed pillar analysis (SDK surface) |
| `/api/v1/health/providers` | GET | Inference provider health (public, no auth) |
| `/api/v1/stream` | GET | SSE real-time updates |
| `/ws/notifications/{user_id}` | WS | WebSocket notifications |
| `/metrics` | GET | Prometheus exposition (policy + shadow metrics) |

Internal structure (`backend/core/src/`):
- `pillars/implementations/ai_safety_pillars.py` — the five pillar implementations; all inference goes through one `_pillar_inference()` service.
- `config/pillar_models.py` — **single source of truth** for the per-pillar model matrix and decoding parameters.
- `inference/` — provider registry, deterministic router, per-provider circuit breakers (in-memory or Redis-backed).
- `policy/` — Policy Engine (schema, evaluator, resolution, engine, runtime host, mode client, shadow integration).
- `orchestration/` — pillar registry, execution manager, score aggregator.
- Core is **DB-less**: all persistence goes through connectors/auth APIs.

### Connectors Service (port 8002)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics` | GET | Usage analytics |
| `/api/reports` | GET, POST | Report generation (PDF) |
| `/api/prompts`, `/api/prompts/generate-advanced` | GET, POST | Prompt library + AI generation |
| `/api/models/providers` | GET | Provider/model catalogue (reflects the pillar matrix) |
| `/api/audit-trails/internal/audit-trail` | POST | Internal audit write (hash-chained) — requires `X-Internal-Token` |
| `/api/audit-trails/internal/chain-health*` | GET/POST | Chain verification endpoints |
| `/api/policy/internal/enforcement-mode*` | POST | Enforcement mode rollout/rollback (audited) |
| `/api/policy/internal/preflight-report` | GET | Shadow-history blast-radius report |
| `/metrics` | GET | Prometheus exposition (chain-health metrics) |

**Migration note:** connectors has **no SQL migration runner** — migrations run via raw `psql -f` (Makefile `db-migrate`) or startup hooks / `create_all`; this constrains how schema changes ship.

### Frontend (port 5000)
Next.js 16 dashboard. Traefik routes everything not matched by an API path to it.

## Security layers

| Layer | Controls |
|---|---|
| Network | TLS 1.3, HSTS (max-age 1y), 100 req/min rate limit, CORS allowlist |
| Authentication | JWT (24 h expiry), bcrypt (cost 12), API keys bcrypt-hashed and irreversible, Redis token blacklist |
| Data protection | AES-256-GCM vault (96-bit nonce, 128-bit tag), key injected via `VELDRIX_VAULT_KEY` |
| Infrastructure | Non-root containers (uid 1001), isolated bridge network, secrets via environment, health checks + auto-restart |
| Internal service auth | Core→connectors writes require `INTERNAL_SERVICE_TOKEN` (`X-Internal-Token` header). Distinct from `VELDRIX_INTERNAL_API_KEY` (core's own inbound key) — do not confuse the two. |

Compliance mapping: SOC 2 Type II (CC6.1, CC6.7), GDPR Art. 32, HIPAA §164.312(a)(2)(iv), PCI-DSS Req 3.5. Vulnerability reports: **security@veldrixai.ca** (never public GitHub issues).

## Data stores

**PostgreSQL** — `users`, `api_keys`, `notifications`, `payment_history`, `payment_otp_vault` (AES-256), `reports`, `audit_trails` (hash-chained, append-only), `saved_prompts`, `policy_documents`, `policy_active_bindings`. Extensions: `uuid-ossp`, `pg_trgm`.

**Redis** — DB0: sessions/JWT blacklist/rate counters · DB1: cache + circuit-breaker state (256 MB LRU) · DB2: background evaluation and report queues.

## Observability

Prometheus scrapes Traefik, auth, core (`:8001/metrics`), connectors (`:8002/metrics`), Redis. Grafana dashboards provisioned from `observability/grafana/dashboards/`:

| Dashboard | File | Purpose |
|---|---|---|
| Platform Overview | `platform-overview.json` | Latency P50/95/99, request/error rates, DB connections |
| Policy Engine — Decision Records | `policy-decision-record.json` | Decisions by verb/mode, `evaluated:false` rate, fail-mode activations |
| Audit Chain — Health | `policy-chain-health.json` | Per-tenant chain intact/last-verified/length |
| Shadow on Dev Traffic | `policy-shadow-on-dev-traffic.json` | Phase 6 impact guard + dispatch outcomes |

**Telemetry PII rule:** metric labels are closed enumerations only (verb, mode, pillar id, provider tier, tenant UUID) — never request text or payload fields. Enforced by tests.
