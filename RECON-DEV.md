# RECON-DEV.md — Phase 5 Reconnaissance (READ-ONLY)

**Goal of this document:** map production's *actual* topology, secret contract, deploy
mechanism, and migration path so the `dev.veldrixai.ca` Infrastructure-as-Code mirrors
prod faithfully instead of guessing. **No infrastructure is authored in this phase.**
No secret *values* appear below — variable **names only**.

- **Date:** 2026-06-20
- **Phase:** 5 — Dev Environment via IaC (Phase 0 recon)
- **Scope:** READ-ONLY. STOP for human review before any IaC is written.

---

## Finding 1 — Prod service topology, ports, and Traefik routing/TLS

Production runs as a **Docker Compose stack on a single DigitalOcean droplet**
(`docker-compose.yml` base + `docker-compose.prod.yml` overlay). Dev must mirror this
exact topology and port map.

### Services (the three FastAPI services + data layer + gateway + observability)

| Service | Image | Internal port | Role |
|---|---|---|---|
| `traefik` (`veldrix-gateway`) | `traefik:v3.2` | 80 / 443 / 8080 | API gateway, TLS termination, routing — `docker-compose.prod.yml:21-53` |
| `redis` (`veldrix-redis`) | `redis:7-alpine` | 6379 | cache/sessions, appendonly — `docker-compose.prod.yml:58-71` |
| `postgres` (`veldrix-postgres`) | `postgres:16-alpine` | 5432 | primary DB — `docker-compose.prod.yml:128-150` |
| `veldrix-auth` | `…-auth:${IMAGE_TAG}` | **8000** | auth, API keys, billing — `docker-compose.prod.yml:155-199` |
| `veldrix-core` | `…-core:${IMAGE_TAG}` | **8001** | trust evaluation engine — `docker-compose.prod.yml:204-241` |
| `veldrix-connectors` | `…-connectors:${IMAGE_TAG}` | **8002** | analytics, reports, prompts, audit — `docker-compose.prod.yml:246-286` |
| `veldrix-ui` | `…-frontend:${IMAGE_TAG}` | 5000 | Next.js app — `docker-compose.prod.yml:291-339` |
| `prometheus` | `prom/prometheus:v2.54.1` | 9090 | metrics — `docker-compose.prod.yml:76-98` |
| `grafana` | `grafana/grafana:11.3.1` | 3001→3000 | dashboards — `docker-compose.prod.yml:103-123` |

All services share the `veldrix-network` bridge (`docker-compose.prod.yml:344-347`).
Named volumes persist `postgres-data`, `redis-data`, `prometheus-data`, `grafana-data`,
`traefik-letsencrypt`, `traefik-logs` (`docker-compose.prod.yml:352-364`).

### Traefik routing / TLS (the part dev must reproduce with dev domains)

- **Static config** `gateway/traefik.yml`: file-only provider (Docker label discovery is
  **intentionally disabled** — `gateway/traefik.yml:27-30`); web→websecure HTTPS redirect
  (`:10-21`); **Let's Encrypt HTTP-01 challenge**, resolver `letsencrypt`, email
  `admin@veldrixai.ca`, storage `/letsencrypt/acme.json` (`gateway/traefik.yml:33-39`);
  Prometheus metrics on the `traefik` entrypoint (`:42-45`).
- **Dynamic routes** `gateway/dynamic/routes.yml` — **all** API routers are pinned to
  `Host(\`api.veldrixai.ca\`)` (critical, per the warning at `routes.yml:4-7`):
  - `auth-router` → `auth-service` (`http://veldrix-auth:8000`): `/auth /api-keys /billing /notifications /users` (`routes.yml:12-23`, svc `69-81`)
  - `core-router` → `core-service` (`http://veldrix-core:8001`): `/api/v1 /trust /health /evaluate /pillars /policy /reports /audit /ws` (`routes.yml:26-37`, svc `84-93`)
  - `connectors-router` → `connectors-service` (`http://veldrix-connectors:8002`): `/api/analytics /api/reports /api/prompts /api/audit /api/latency /api/models /api/metrics /connectors /api/connectors /api/audit-trails` (`routes.yml:40-51`, svc `96-103`)
  - `frontend-router` → `frontend-service` (`http://veldrix-ui:5000`): `Host(app|root|www .veldrixai.ca)`, priority 1 catch-all (`routes.yml:55-65`, svc `106-113`)
  - Per-router TLS via `certResolver: letsencrypt`; middlewares `security-headers`, `cors`, `rate-limit` (`routes.yml:115-153`).

**Dev mirror requirement:** same image versions, same internal ports, same router/service
graph — only the `Host()` rules, ACME email, and CORS origin lists change to the dev
subdomain scheme (see Finding 5).

---

## Finding 2 — Env-var / secret contract per service (NAMES ONLY)

Sourced from `docker-compose.prod.yml`, `.env.production.example`, and `.env.example`.
**No values printed.** Each name below must have a **dev-scoped** counterpart in dev's
gitignored env file (test/sandbox keys; never shared with prod).

### Shared / data layer
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (`docker-compose.prod.yml:133-135`);
`DATABASE_URL` (derived, `:165`/`:256`); `REDIS_URL` (per-service DB index 0/1/2,
`:178/:220/:260`); `LOG_LEVEL`, `CORS_ORIGINS`/`VELDRIX_CORS_ORIGINS`.

### `veldrix-auth` (8000) — `docker-compose.prod.yml:163-180`
`APP_ENV`, `DATABASE_URL`, `JWT_SECRET_KEY` (or legacy `JWT_SECRET`), `VELDRIX_VAULT_KEY`,
`NVIDIA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_GROW_MONTHLY`, `STRIPE_PRICE_GROW_ANNUAL`, `STRIPE_PRICE_SCALE_MONTHLY`,
`STRIPE_PRICE_SCALE_ANNUAL`, `VELDRIX_UI_URL`, `RESEND_API_KEY`, `REDIS_URL`,
`STRIPE_CUSTOMER_HASH_KEY` (`.env.production.example:19`).

### `veldrix-core` (8001) — `docker-compose.prod.yml:213-223`
`APP_ENV`, `JWT_SECRET_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY`, `VELDRIX_AUTH_URL`,
`VELDRIX_CONNECTORS_URL`/`CONNECTORS_URL`, `REDIS_URL`, `CIRCUIT_BREAKER_BACKEND`.
Inference / pillar routing (from `.env.example`): `NVIDIA_API_BASE_URL`, `NVIDIA_MODEL_ID`,
`VELDRIX_PILLAR_{CONTENT,HALLUCINATION,BIAS,POLICY,LEGAL}_MODEL`, `VELDRIX_NIM_TIMEOUT_MS`,
`BEDROCK_PROXY_URL`, `BEDROCK_API_KEY`, `BEDROCK_MODEL_ID`, `OSS_INFERENCE_URL`,
`OSS_API_KEY`, `OSS_MODEL_ID`, circuit-breaker tunables (`CIRCUIT_*`),
`VELDRIX_INTERNAL_API_KEY` (the internal service-to-service token — note the prompt calls
this `INTERNAL_SERVICE_TOKEN`; **the real name is `VELDRIX_INTERNAL_API_KEY`**),
rate-limit/queue tunables (`VELDRIX_RATE_LIMIT_*`, `VELDRIX_QUEUE_*`).

### `veldrix-connectors` (8002) — `docker-compose.prod.yml:255-268`
`APP_ENV`, `DATABASE_URL`, `JWT_SECRET_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY`, `REDIS_URL`,
`CONNECTOR_ENCRYPTION_KEY` (Fernet), `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`,
`EMAIL_SUPPORT_ADDRESS`, `VELDRIX_UI_URL`.

### `veldrix-ui` (frontend, 5000) — `docker-compose.prod.yml:298-320`
Build args: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENV`,
`NEXT_PUBLIC_VELDRIX_CORE_URL`, `NEXT_PUBLIC_VELDRIX_CORE_API_URL`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Runtime: `NEXT_PUBLIC_VELDRIX_AUTH_URL`,
`NEXT_PUBLIC_VELDRIX_CONNECTORS_URL`, `VELDRIX_AUTH_API_URL`, `VELDRIX_CORE_API_URL`,
`VELDRIX_CONNECTORS_API_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

### Observability
`GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` (`docker-compose.prod.yml:108-109`).

> **Secret-handling rule for the IaC phase:** every name above maps to a placeholder in
> `terraform.tfvars.example` / dev env example; real values are human-supplied and
> gitignored. The open editor file `e2e-test/.env` (names: `VELDRIX_API_KEY`,
> `OPENAI_API_KEY`) is a local test artifact — **do not** copy or reference it in IaC.

---

## Finding 3 — How prod is deployed today (the shape dev replicates)

**Jenkins CI/CD → DigitalOcean droplet over SSH** (`Jenkinsfile`):
- Build per-service + frontend Docker images, tag with `IMAGE_TAG` + `latest`, registry
  `ghcr.io/veldrixai` (`Jenkinsfile:57, 500-515`).
- Push to GHCR on `main` only (`Jenkinsfile:524-539`).
- **Deploy stage** (`Jenkinsfile:548-595`, `main` only): installs `doctl`, auths with
  `DIGITAL_OCEAN_PAT`, `scp`s `docker-compose.prod.yml` + the env file to
  `deploy@api.veldrixai.ca:/opt/veldrixai/`, then over SSH runs
  `docker-compose -f docker-compose.prod.yml pull && up -d --no-deps --remove-orphans`,
  and health-checks 8000/8001/8002.
- Credentials are Jenkins-managed: `DOCKER_HUB_CREDS`, `DIGITAL_OCEAN_PAT`,
  `VELDRIX_ENV_FILE` (`Jenkinsfile:15-16, 560-562`).

**Implication for IaC:** dev = a **second DO droplet** (same region/size class) running the
same Compose overlay, parameterized by `environment`. Terraform provisions droplet + DNS
(+ Vercel for the frontend); the **APPLY is human-run** with their DO/Vercel credentials.
There is **no existing Terraform in the repo** (`find … *.tf` → none) — this phase
introduces the first IaC.

---

## Finding 4 — Migration mechanism dev must run (incl. unapplied 009/011)

**There is no `.sql` migration runner.** Schema is materialized by SQLAlchemy
`Base.metadata.create_all()` at service boot, plus per-service Python `_run_migrations()`
hooks for additive column/trigger changes. The numbered `.sql` files are the **canonical,
human-reviewable** form — some are auto-applied via ORM/hook, some are explicitly **not
yet applied**.

- **auth** — `backend/auth/app/main.py:23` `create_all()`; `:26-43` `_run_migrations()`
  idempotent boot hook. Reviewable `.sql` set: `backend/auth/migrations/*.sql`
  (api-key prefix index, billing fields, OTP vault + payment history, stripe customer hash).
- **connectors** — `backend/connectors/src/main.py:21` `create_all()`; `:24-32` comment
  explicitly states *"This codebase has no SQL-file migration runner for connectors"*;
  `:33-105` `_run_migrations()` applies the **010 audit hash-chain + append-only trigger**
  on boot (drops trigger → backfills → recreates trigger, `:51/:84-99`).
- **Ordered `.sql` set** under `backend/connectors/migrations/`:
  `000_full_schema` → `001_kan14_reports_audit` → `002_add_trust_evaluation_type` →
  `003_kan16_soft_delete` → `004_kan20_saved_prompts` → `005_add_report_name_vx_id` →
  `006_add_audit_intelligence_fields` → `007_audit_idempotency` →
  `008_add_pillar_labels` / `008_audit_lookup_optimization` →
  **`009_policy_engine`** → `010_audit_hash_chain` → **`011_enforcement_mode_rollout`**.
- **Still-unapplied, by design:**
  - `009_policy_engine.sql` header: *"ADDITIVE — NOT YET APPLIED … STOP for human review
    before applying."* The policy table is currently materialized only via the ORM model's
    `create_all()` (`backend/connectors/src/modules/policy/models.py:5-7`).
  - `011_enforcement_mode_rollout.sql` header: *"ADDITIVE — reviewable artifact"*, same
    create_all pattern (`…/policy/models.py`).

> **Dev requirement (build phase):** dev must apply the **full ordered set incl. 009 & 011**
> against a fresh dev DB. Because there is no generic runner, the dev seed/bootstrap step
> must `psql -f` the ordered `.sql` files (or extend the boot hooks) — this is also the
> **first end-to-end proof** that 009/011 apply cleanly on a clean schema. Seeds writing
> audit rows must go **through** the `_run_migrations()` hash-chain path and **must not**
> bypass the `audit_trails_append_only` trigger (`backend/connectors/src/main.py:84-99`).

---

## Finding 5 — Prod config that must DIFFER in dev

| Concern | Prod | Dev (must differ) |
|---|---|---|
| Domains / hosts | `app.veldrixai.ca`, `api.veldrixai.ca`, `veldrixai.ca`, `www` (`routes.yml:13-56`) | `dev.veldrixai.ca` + the mirrored `api.dev.veldrixai.ca` (final scheme decided in build) |
| ACME email / certs | `admin@veldrixai.ca`, prod LE store (`traefik.yml:36`) | dev ACME contact + **separate** `acme.json` volume (LE staging recommended to avoid rate limits) |
| CORS origins | prod hosts (`routes.yml:141-145`, compose `:180/:223/:268`) | dev hosts only |
| Frontend public URLs | `NEXT_PUBLIC_API_BASE=https://api.veldrixai.ca` etc. (`compose:298-313`) | dev API base; **Vercel preview** target |
| Billing | Stripe **live** keys (`.env.production.example:28` `sk_live_…`) | Stripe **test mode** keys |
| Inference / provider keys | prod NVIDIA/Groq/Bedrock/OSS keys | dev/sandbox test keys or stubs |
| `JWT_SECRET_KEY`, `VELDRIX_INTERNAL_API_KEY`, `VELDRIX_VAULT_KEY`, `CONNECTOR_ENCRYPTION_KEY`, `STRIPE_CUSTOMER_HASH_KEY` | prod secrets | **distinct** dev secrets, never shared |
| Postgres / Redis | prod instances/creds (`compose:128-150`, `:58-71`) | **separate** dev instances + creds; no dev string may resolve to a prod host |
| OAuth | prod Google/GitHub client IDs + callback URLs (`compose:317-320`) | dev OAuth apps + dev callback URLs |
| Grafana admin | prod creds (`compose:108-109`) | dev creds |
| Resend / email | prod `RESEND_API_KEY`, `noreply@veldrixai.ca` (`compose:262-265`) | dev Resend key / dev sender |
| Image tags | `IMAGE_TAG` from `main` (`Jenkinsfile:57`) | dev branch tag |

The IaC must **parameterize these into an `environment` variable** so one definition emits
both prod and dev — parity is structural, drift is impossible by construction.

---

## Finding 6 — Existing seed / fixture code

**No application-level seed or data-generation script exists.** Search for
`seed|fixture|faker|factory` (`--include=*.py`) returns only:
- `backend/connectors/src/modules/reports/services/report_namer.py:39` — a deterministic
  report-*name* generator (`generate_report_name(seed=…)`), not a data seeder.
- `backend/connectors/tests/adversarial/conftest.py` — **pytest** DB fixtures (test-only).
- Various `field(default_factory=…)` dataclass defaults (unrelated).

No `faker`/`factory_boy` dependency, no `seed.py`, no SQL seed file. **The Phase 5 minimal
synthetic seed must be built from scratch.** It must: generate obviously-fake tenants/users/
policies + a modest set of synthetic audit rows; write audit rows **through** the real
hash-chain path (respecting the append-only trigger, Finding 4); be idempotent/re-runnable;
contain **zero** prod-derived data.

---

## Bonus finding — Frontend API base URL parameterization (drift check)

The prompt asks to confirm the frontend API base is env-parameterized or flag a hardcoded
prod URL.

- **Server-side config is correctly parameterized** — `frontend/lib/config.ts:5-15`:
  `AUTH/CORE/CONNECTORS_API_URL` read `VELDRIX_*_API_URL` env vars with **dev-only**
  localhost fallbacks (production branch compiles to `""`, no localhost ships).
- **⚠️ DRIFT BUG — hardcoded prod fallback:** `frontend/lib/veldrix-api.ts:10-14` — the
  public client `BASE` falls back to **`?? "https://api.veldrixai.ca"`** when
  `NEXT_PUBLIC_VELDRIX_CORE_API_URL` / `NEXT_PUBLIC_VELDRIX_CORE_URL` are unset. In a dev
  build that forgets to set the NEXT_PUBLIC var, the client SDK path would **silently call
  prod**. **Flag:** dev's Vercel/build env MUST set `NEXT_PUBLIC_VELDRIX_CORE_API_URL` to
  the dev API; consider changing the fallback to env-required (fail-closed) rather than
  defaulting to prod. Recorded as a parity-checklist item for the build phase.

---

## Parity-difference summary (identical vs deliberately different)

- **Identical (structural parity):** service set + internal ports (8000/8001/8002/5000),
  image versions (traefik v3.2, postgres 16, redis 7, etc.), Traefik router/service graph,
  middleware chain, Compose network/volume shape, deploy shape (Compose-on-DO-droplet),
  schema-via-`create_all`+boot-hooks mechanism.
- **Deliberately different:** all of Finding 5 — domains, ACME contact, CORS, frontend
  public URLs (+ Vercel), Stripe test mode, dev/sandbox inference keys, every secret
  (`JWT_SECRET_KEY`, `VELDRIX_INTERNAL_API_KEY`, vault/connector/customer-hash keys),
  separate Postgres/Redis instances + creds, OAuth dev apps, Grafana creds, image tag.

---

## STOP — awaiting review

Per the phase execution order, no IaC, service config, seed, or verify script is written
until this `RECON-DEV.md` is reviewed. Open questions to settle before the build:

1. **Subdomain scheme** — `api.dev.veldrixai.ca` (mirror) vs `dev.veldrixai.ca/api` path —
   recommend `api.dev.veldrixai.ca` to keep the `Host()`-pinned router contract intact.
2. **Let's Encrypt staging vs prod** for dev certs (recommend staging to avoid rate limits).
3. **Inference in dev**: real dev/sandbox provider keys vs stubbed responses.
4. Whether to fix the `veldrix-api.ts` hardcoded-prod fallback now or track it as a
   follow-up (it is app logic; Phase 5 constraint says do not modify application logic —
   recommend tracking, not fixing here).
