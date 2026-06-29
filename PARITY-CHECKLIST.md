# PARITY-CHECKLIST.md — VeldrixAI dev vs prod (Phase 5)

Companion to `RECON-DEV.md`. What is **identical by construction**, what is
**deliberately different**, and the **tracked follow-ups**. The whole dev/prod
difference is the variable diff in `infra/terraform/environments/*.tfvars` +
`infra/compose/.env.deploy` — the `.tf` and compose definitions are shared.

---

## A. Identical (structural parity — drift impossible by construction)

| Concern | Mechanism | Source |
|---|---|---|
| Service set + internal ports | auth 8000 / core 8001 / connectors 8002 / ui 5000 | `infra/compose/docker-compose.deploy.yml` |
| Image versions | traefik v3.2, postgres:16-alpine, redis:7-alpine, prom v2.54.1, grafana 11.3.1 | same compose |
| Traefik router/service graph | `auth/core/connectors/frontend` routers + services + middleware chain (security-headers, cors, rate-limit) | `infra/gateway/dynamic/routes.template.yml` |
| Host()-pinned API routers | all API routers pinned to the API host (critical cookie-stripping guard) | routes template |
| Network + volume shape | one bridge network, named volumes for pg/redis/prom/grafana/acme/logs | compose |
| Deploy shape | Compose-on-DO-droplet, pull+up; ship via scp+ssh | `infra/scripts/dev-up.sh`, mirrors `Jenkinsfile` |
| Schema mechanism | `create_all()` + per-service `_run_migrations()` boot hooks | unchanged app code |

## B. Deliberately different (the variable diff)

| Concern | Prod | Dev |
|---|---|---|
| API host | `api.veldrixai.ca` | `api.dev.veldrixai.ca` (mirrored — decision #1) |
| App host | `app/www/veldrixai.ca` | `dev.veldrixai.ca` |
| ACME resolver | prod LE directory | **LE-staging** (decision #2), **separate `acme.json` volume** |
| ACME contact | `admin@veldrixai.ca` | `dev-admin@veldrixai.ca` |
| CORS origins | prod hosts | dev hosts only |
| Frontend public URLs | prod api host | dev api host (all `NEXT_PUBLIC_*` set explicitly — see §C) |
| Stripe | live keys | **test mode** keys |
| Inference | real provider keys | **stub by default** (decision #3); live seam built |
| Secrets (`JWT_SECRET_KEY`, `VELDRIX_INTERNAL_API_KEY`, `INTERNAL_SERVICE_TOKEN`, `VELDRIX_VAULT_KEY`, `CONNECTOR_ENCRYPTION_KEY`, `STRIPE_CUSTOMER_HASH_KEY`, Grafana) | prod values | **distinct dev values**, never shared |
| Postgres/Redis | prod instances/creds, db `veldrix` | separate dev droplet instances, db `veldrix_dev`, distinct creds |
| Container/volume/network names | `veldrix-*` / `veldrix-network` | `veldrix-dev-*` / `veldrix-dev-network` (cannot collide) |
| Image tag | `latest` (main) | `dev` (dev branch) |
| OAuth | prod apps/callbacks | dev apps/callbacks |

Isolation is **asserted at runtime** by `infra/scripts/verify-dev.sh` §3 (db name
not the prod default, no connection string references a prod host, isolated
container/volume names) — the critical "no dev string resolves to prod" check.

---

## C. Tracked items (must close before real dev testing)

### C1. Frontend drift-bug guard (tracked + guarded here; NOT fixed here)
`frontend/lib/veldrix-api.ts:10-14` hardcodes a prod fallback:
```ts
const BASE = (process.env.NEXT_PUBLIC_VELDRIX_CORE_API_URL ??
              process.env.NEXT_PUBLIC_VELDRIX_CORE_URL) ?? "https://api.veldrixai.ca";
```
If a dev build forgets to set the `NEXT_PUBLIC_*` var, the client SDK silently
calls **prod**. Phase 5 forbids touching app logic, so we **guard** it: the dev
build sets *every* public URL var explicitly to the dev API host —
- compose `veldrix-ui` env block (`docker-compose.deploy.yml`)
- Vercel project env vars (`infra/terraform/vercel.tf`)
so the fallback is structurally unreachable in dev. `verify-dev.sh` §8 asserts the
frontend resolves to the dev API and references no prod host.

### C2. Fail-closed follow-up (one-line app fix — land BEFORE real dev testing)
Change the `veldrix-api.ts` fallback from defaulting-to-prod to **fail-closed**
(throw when unset), e.g.:
```ts
const BASE = process.env.NEXT_PUBLIC_VELDRIX_CORE_API_URL
          ?? process.env.NEXT_PUBLIC_VELDRIX_CORE_URL;
if (!BASE) throw new Error("NEXT_PUBLIC_VELDRIX_CORE_API_URL is required");
```
This is a separate tiny app-logic change (Phase 5 §5 step 3), out of scope for the
infra-only build. **Status: OPEN.**

### C3. Internal-token naming drift (NEW finding — recon was incomplete)
`RECON-DEV.md` Finding 2 says the internal token is `VELDRIX_INTERNAL_API_KEY`
"not `INTERNAL_SERVICE_TOKEN`". In reality **both names exist** and gate different
service pairs:
- **`VELDRIX_INTERNAL_API_KEY`** — core `/api/v1` key gating + core→auth
  notifications (`core/src/api/v1/dependencies.py`, `auth/app/api/notifications.py`).
- **`INTERNAL_SERVICE_TOKEN`** — core→connectors audit-write / chain-health /
  enforcement-mode (caller `core/src/core/http_pool.py:37`, verifier
  `connectors/src/core/middleware/internal_auth.py:27`).

Dev wires **both** (distinct dev values) in `docker-compose.deploy.yml` /
`.env.deploy.example`; without `INTERNAL_SERVICE_TOKEN`, chain-health + audit-write
fail-safe to 503 and `verify-dev.sh` §6 goes red. **Status: handled in dev; the
naming inconsistency in the app remains a documentation/cleanup follow-up.**

### C4. `.sql` vs `create_all()` drift check
`infra/db/check-drift.sh` asserts the high-risk 009/010/011 objects (policy tables,
`shadow` default + CHECK, audit chain columns + append-only trigger) exist on the
dev DB after both paths run — surfacing drift rather than papering over it. A
**rigorous full check** (`pg_dump --schema-only` of a `.sql`-built DB vs a
`create_all`-built DB, diffed) is a **follow-up**. **Status: targeted check in
place; full diff OPEN.**

---

## E. Local dev mirror (Phase 5 local build — `docker-compose.dev.yml`)

The **free local mirror** (WSL2 + Docker Desktop, `DEV_LOCAL.md`) is a standalone,
build-from-source variant of the same topology. It shares the follow-ups above
(C1/C2 drift guard, C3 two-token wiring, C4 drift check) and differs from the cloud
path only where local *requires* it:

| Concern | Cloud dev (deploy.yml) | Local mirror (docker-compose.dev.yml) |
|---|---|---|
| Image source | **pull** GHCR (`ghcr.io/veldrixai/…`) | **build from source**, `target: development` (hot-reload) |
| TLS | Let's Encrypt **staging** (ACME) | **self-signed mkcert**, locally trusted (`gateway/local/*`) |
| Resource names | `veldrix-dev-*` | `veldrix-localdev-*` (cannot collide with prod, cloud-dev, or legacy stack) |
| Bringup | `scp`+`ssh` to droplet | `make dev-up` (Docker Desktop in WSL2) |
| Observability | always on | `observability` profile — **full** default, **lean** opt-out |
| Verify | `infra/scripts/verify-dev.sh` (asserts LE-staging) | `infra/scripts/verify-dev-local.sh` (asserts mkcert, trusted) |

**Identical by construction:** service set + ports (8000/8001/8002/5000), image
versions, Traefik **router/service graph** + middleware chain (security-headers, cors,
rate-limit), `Host()`-pinned API routers, schema via `create_all()`+boot hooks, the
canonical `.sql` 009/011 applied by `bootstrap-migrations.sh`, the stub inference seam
(`mock-inference`, `route_inference()` untouched), and the synthetic chain-respecting
seed. The router graph is the self-signed parameterization of the same gateway — local
swaps `tls: { certResolver: letsencrypt }` for `tls: {}` + a mkcert default store; the
rule/middleware/service blocks are byte-identical.

---

## D. Phase 5 acceptance cross-check

- [x] `terraform validate`/`plan` are the deliverable; **`apply` NOT run by the agent** (human-run, APPLY-RUNBOOK).
- [x] One env-parameterized IaC emits dev+prod; diff lives only in tfvars.
- [x] Cert resolver parameterized (LE-staging dev / LE-prod prod); separate `acme.json` volume.
- [x] No real secret value committed/printed; names + placeholders only; `e2e-test/.env` not referenced.
- [x] Dev DB/Redis/secrets isolation asserted by `verify-dev.sh` §3.
- [x] Full ordered migrations incl. 009/011 applied on fresh DB via `psql -f` (canonical mechanism, not a new one); drift surfaced.
- [x] Internal token wired under `VELDRIX_INTERNAL_API_KEY` **and** `INTERNAL_SERVICE_TOKEN` (dev-scoped, distinct from prod) — see C3.
- [x] Traefik graph identical; only host/CORS/ACME differ; `Host()`-pinned to dev hosts.
- [x] Minimal synthetic seed, idempotent, obviously-fake, zero prod data; audit rows written THROUGH the hash chain (trigger not bypassed); chain-health green.
- [x] Inference defaults to stub; stub→live seam built + documented; verify reports `stub`.
- [x] Frontend dev build sets all `NEXT_PUBLIC_*` URL vars to dev; verify confirms dev (not prod); C1/C2 recorded.
- [x] Zero changes to prod infra, prod config, or application logic (incl. untouched `veldrix-api.ts`).
- [x] `DEV_ENVIRONMENT.md` covers apply/seed/verify/reset/teardown + parity + cost + stub→live flip.
