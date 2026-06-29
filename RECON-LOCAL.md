# RECON-LOCAL.md — Phase 5 (Local Build) Reconnaissance (READ-ONLY)

**Goal of this document:** confirm the *local-specific* unknowns before standing up `dev`
as a **free local Docker Compose mirror** (WSL2 + Docker Desktop). Topology, secret
contract, deploy shape, and migration path are already mapped in `RECON-DEV.md`; this
recon only resolves what the *local* build needs that the cloud recon did not settle:
**build-vs-pull, host arch, self-signed TLS override, fresh-DB migration trigger, and the
healthchecks `verify-dev.sh` will reuse.** No build artifacts are authored in this phase.
No secret *values* appear below — variable **names only**.

- **Date:** 2026-06-21
- **Phase:** 5 — Dev Environment, **Local Compose Mirror** (Phase 0 recon)
- **Scope:** READ-ONLY. STOP for human review before any local IaC/overlay is written.

> **Context — prior work already on disk (untracked `infra/`):** a previous pass built the
> **deferred cloud/droplet path**: `infra/compose/docker-compose.deploy.yml` (env-parameterized,
> pulls GHCR images, ships over SSH), `infra/gateway/` (LE-staging Traefik templates +
> `render-gateway.sh`), `infra/db/bootstrap-migrations.sh`, `infra/mock-inference/` (the stub
> seam), `infra/seed/seed_dev.py`, `infra/scripts/*`, and `infra/terraform/` (the deferred DO
> droplet). **The local build does not start from scratch — it mostly *re-parameterizes* this
> existing deploy overlay for build-from-source + self-signed TLS + WSL2.** See the Reuse note.

---

## Finding 1 — Compose **builds** vs **pulls** (local MUST build from source) — RESOLVED

Three compose files exist; they differ exactly on this axis:

| File | Image source for the 4 app services | Use |
|---|---|---|
| `docker-compose.yml` | **BUILD** — `build.context` + `target: development`, no `image:` (`docker-compose.yml:47-50, 80-83, 113-116, 194-197`) | existing local dev (hot-reload, **no Traefik/TLS**) |
| `docker-compose.prod.yml` | BOTH `image:` *and* `build:` `target: production` (`docker-compose.prod.yml:156-160, 205-209, 247-251, 292-296`) | prod on the droplet |
| `infra/compose/docker-compose.deploy.yml` | **PULL ONLY** — `image: ${DOCKER_REGISTRY:-ghcr.io/veldrixai/veldrixai}-*:${IMAGE_TAG}`, **no `build:`** (`:127, 167, 212, 250`) | cloud dev/prod deploy (Jenkins→GHCR) |

**Resolution:** the local dev mirror **cannot pull private GHCR images** (no auth, and we want
local source). The cloud `deploy.yml` is otherwise the closest-to-prod, fully-parameterized
definition (per-env volumes, stub-default, drift guards), but it pulls. So the local overlay
must **supply `build:` contexts** for the four app services (`veldrix-auth`, `veldrix-core`,
`veldrix-connectors`, `veldrix-ui`). Every Dockerfile already has the needed stages —
`development` **and** `production` targets in `backend/{auth,core,connectors}/Dockerfile` and
`frontend/Dockerfile` (`backend/auth/Dockerfile:17, 25`; `frontend/Dockerfile:42, 65`).
`mock-inference` **already has a `build:` block** in `deploy.yml:292-296` (no GHCR image), so
it builds as-is. **Build target choice is a build-phase decision** (`development` = hot-reload
+ mounted source, highest dev fidelity; `production` = closer to the shipped artifact).

---

## Finding 2 — Host arch / platform pins (none — WSL2/amd64 is clean) — RESOLVED

`grep -n 'platform:|--platform'` across **all** compose files and **all** Dockerfiles
(`backend/*/Dockerfile`, `frontend/Dockerfile`, `infra/mock-inference/Dockerfile`) → **zero
matches.** No `platform:` service key, no `FROM --platform=` pin. Base images are all
multi-arch official tags: `python:3.11-slim`, `node:20-alpine`, `postgres:16-alpine`,
`redis:7-alpine`, `traefik:v3.2`, `prom/prometheus:v2.54.1`, `grafana/grafana:11.3.1`.

**Implication:** on a Windows/WSL2 x86-64 dev box, all images resolve to `linux/amd64`
natively — no QEMU emulation, no arch foot-gun. Nothing to override. (If a future dev runs
Apple-silicon/arm64, the same multi-arch tags still resolve; only `mock-inference` and the
app images build from source and would compile for the host arch automatically.)

---

## Finding 3 — Traefik config to override for **self-signed local TLS** — RESOLVED

Locked decision: local uses **self-signed certs (mkcert)**, NOT Let's Encrypt — LE's HTTP-01
challenge needs public DNS, which the local mirror does not have. Current configs are all
**ACME/LE-based**:

- Static: `gateway/traefik.yml:33-39` (`certificatesResolvers.letsencrypt.acme` + `httpChallenge`);
  the parameterized template `infra/gateway/traefik.template.yml:31-38` keeps the `letsencrypt`
  resolver and only parameterizes `${ACME_EMAIL}` / `${ACME_CA_SERVER}` (LE-staging for dev per
  `render-gateway.sh:20-28`).
- Dynamic: every router carries `tls: { certResolver: letsencrypt }`
  (`infra/gateway/rendered/dynamic/routes.yml:23-24, 36-37, 49-50, 61-62`).
- Compose entrypoint pre-creates the ACME store: `touch /letsencrypt/acme.json && chmod 600 …`
  (`docker-compose.prod.yml:28-31`, `infra/compose/docker-compose.deploy.yml:24-27`).

**Local override scope (build phase):**
1. **Static config:** drop the `certificatesResolvers` / ACME block; add a **TLS file
   provider** entry pointing at a mounted mkcert cert+key (e.g. a `tls.certificates` /
   `tls.stores.default.defaultCertificate` dynamic file). The web→websecure redirect, file
   provider, metrics, and middleware blocks stay byte-identical.
2. **Dynamic routes:** replace each router's `tls: { certResolver: letsencrypt }` with
   `tls: {}` (serve the default/self-signed store). Router/service **graph, Host() rules,
   middleware chain stay identical** to prod — only the cert mechanism changes.
3. **Compose:** the `touch/chmod acme.json` entrypoint + `traefik-letsencrypt` volume become
   unnecessary locally (harmless to keep, but the mkcert cert is mounted read-only instead).

**Parameterize, don't fork:** keep the resolver name/structure so ONE config family does
self-signed in dev and LE in prod — extend `render-gateway.sh`'s env switch with a `local`
mode (mkcert, no ACME) alongside the existing `dev`(LE-staging)/`prod`(LE) cases, rather than
hand-maintaining a divergent file. Hostnames `api.dev.veldrixai.ca` + `dev.veldrixai.ca` map
to `127.0.0.1` via the WSL2 (and Windows) hosts file.

---

## Finding 4 — Migration trigger on a **fresh local DB** (incl. 009/011) — RESOLVED

Mechanism (confirmed, matches `RECON-DEV.md` Finding 4):
- **auth** — `backend/auth/app/main.py:23` `Base.metadata.create_all()`; `:26-43`
  `_run_migrations()` (OAuth nullable password + profile columns), wrapped try/except `:40-43`.
- **connectors** — imports **all** models first, incl. `src.modules.policy.models` at
  `backend/connectors/src/main.py:18`, **then** `create_all()` at `:21` → this is where the
  **009 policy + 011 enforcement** tables materialize **via the ORM**. `:33-98` `_run_migrations()`
  applies **010** audit hash-chain (additive cols + index `:42-45`, drop-trigger→backfill→
  recreate-trigger `:51, 86-97`), wrapped try/except `:101-106`.
- **core** — **no** `create_all`/`_run_migrations` (grep → no matches): the trust engine is
  **stateless**, owns no DB (no `DATABASE_URL`). Nothing to migrate.

**The 009/011 drift point (must surface, not paper over):** on a fresh DB, `create_all()`
produces the policy/enforcement tables from the **ORM models**, which may NOT reproduce the
exact DDL (indexes, constraints, defaults, enum types) the **canonical `.sql`** files specify —
those `.sql` files are never auto-applied in prod. The cloud pass already built the right tool:
**`infra/db/bootstrap-migrations.sh`** applies the **full ordered canonical set 000→011 (incl.
009 + 011)** via `psql -v ON_ERROR_STOP=1`, idempotently, in order (`infra/db/bootstrap-migrations.sh:34-48, 76-85`).
It supports `USE_DOCKER=1` (`docker compose exec postgres psql`, `:61-63`) — **directly usable
locally** against the local Postgres container. **Reuse it; do not invent a parallel runner.**

**Local bringup order (build phase):** start postgres → `bootstrap-migrations.sh` (canonical
`.sql`, the first end-to-end proof 009/011 apply on a clean schema) → start services
(`create_all` + boot hooks run idempotently on top, incl. 010's trigger) → seed. Any
`.sql`-vs-`create_all` divergence shows up here and gets reported, not hidden.

---

## Finding 5 — Healthchecks `verify-dev.sh` reuses — RESOLVED

All defined in `infra/compose/docker-compose.deploy.yml` (reused verbatim by the local overlay):

| Service | Port | Healthcheck | Source |
|---|---|---|---|
| `traefik` | 80/443/8080 | `traefik healthcheck` | `deploy.yml:42` |
| `redis` | 6379 | `redis-cli ping` | `deploy.yml:58` |
| `postgres` | 5432 | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` | `deploy.yml:116` |
| `veldrix-auth` | 8000 | `curl -f http://localhost:8000/health` | `deploy.yml:154` |
| `veldrix-core` | 8001 | `curl -f http://localhost:8001/health` | `deploy.yml:200` |
| `veldrix-connectors` | 8002 | `curl -f http://localhost:8002/health` | `deploy.yml:238` |
| `veldrix-ui` | 5000 | `wget -q --spider http://127.0.0.1:5000/` | `deploy.yml:277` |
| `mock-inference` | 9009 | `urllib GET http://localhost:9009/health` (returns `{"status":"ok","mode":"stub"}`) | `deploy.yml:303`, `infra/mock-inference/app.py:80-82` |

`verify-dev.sh` (already scaffolded for the cloud path at `infra/scripts/verify-dev.sh`)
asserts these per-port, plus: Traefik routes `dev.veldrixai.ca` + `api.dev.veldrixai.ca`
(self-signed accepted), DB/Redis dev-only, 009/011 present, seed present + chain-health green,
`VELDRIX_INFERENCE_MODE=stub`, and **frontend resolves to `api.dev.veldrixai.ca`, never prod**.
The local build adapts it to hit `127.0.0.1` over self-signed (`curl -k`) instead of a droplet.

---

## Reuse / parity note — what the local build re-parameterizes vs writes new

**Already built (cloud path) and directly reusable locally:**
- `infra/compose/docker-compose.deploy.yml` — env-parameterized topology, per-env volume/network
  isolation (`veldrix-${ENVIRONMENT}-*`), `mock-inference` stub default via `--profile stub`,
  the `NEXT_PUBLIC_*` drift guards (`:258-265`). **Needs only: add `build:` to the 4 app
  services (Finding 1) + observability profile-gating for the lean/full RAM modes.**
- `infra/mock-inference/` — the deterministic stub seam (Finding: stub already done, free, no
  network). `VELDRIX_INFERENCE_MODE=${…:-stub}` already wired (`deploy.yml:184`); core points
  `NVIDIA_API_BASE_URL` at `http://mock-inference:9009/v1` (`deploy.yml:186`). **Untouched.**
- `infra/db/bootstrap-migrations.sh` — canonical 009/011 application, `USE_DOCKER=1` local-ready.
- `infra/seed/seed_dev.py`, `infra/scripts/verify-dev.sh`, observability dashboards.

**Net-new for local (build phase):** a **self-signed Traefik override** (Finding 3) + a
**local-build compose overlay** adding `build:` (Finding 1), a **`local` mode** in
`render-gateway.sh` (mkcert, no ACME), `Makefile` targets (`dev-up/down/reset/seed/verify`)
driving Docker-Desktop-in-WSL2 instead of SSH-to-droplet, `.env.dev` (gitignored) +
`.env.dev.example`, mkcert/hosts-file steps, and `DEV_LOCAL.md`. The existing `dev-up.sh`
is **droplet-targeted** (`scp`/`ssh` to `$DROPLET`, `infra/scripts/dev-up.sh:17, 28-48`) — the
local Makefile is a **sibling**, not a replacement (the cloud path stays for when funded).

---

## Carry-forward cautions (not blockers, flag before build)

1. **Terraform state/secrets on disk:** `infra/terraform/` contains `terraform.tfstate`,
   `dev.tfplan`, and `secrets.auto.tfvars` — confirm `infra/terraform/.gitignore` excludes them
   and **nothing secret is staged** before any commit (git status shows `infra/` still
   untracked). The local prompt keeps terraform **deferred & un-applied**; do not apply it.
2. **`veldrix-api.ts` drift bug** (`frontend/lib/veldrix-api.ts:10-14` `?? "https://api.veldrixai.ca"`):
   the `deploy.yml` already guards it by setting **every** `NEXT_PUBLIC_*` URL explicitly
   (`:258-265`); the local overlay must do the same so the prod fallback can never fire. The
   one-line **fail-closed** code fix stays a **separate follow-up** (Phase 5 constraint: no app
   logic changes here).
3. **WSL2 filesystem, not `/mnt/c`:** clone into `~/VeldrixAI` inside the WSL2 distro — running
   the stack off the Windows-mounted path breaks inotify hot-reload and is slow.
4. **Build target (`development` vs `production`)** for the 4 app services is the main open
   build-phase choice (Finding 1) — `development` maximizes dev-loop fidelity (mounted source +
   `--reload`), `production` maximizes parity with the shipped artifact.

---

## STOP — awaiting review

Per the phase execution order, no compose overlay, Traefik override, env files, seed, or verify
script is written until this `RECON-LOCAL.md` is reviewed. Open questions to settle before the
build:

1. **Build target** for the 4 app services: `development` (hot-reload, mounted source) vs
   `production` (shipped-artifact parity)? — recommend `development` for the dev loop.
2. **Self-signed mechanism:** mkcert (trusted locally, recommended) vs Traefik's built-in
   default self-signed (zero-install but browser-untrusted)?
3. **Overlay strategy:** layer a `docker-compose.dev.yml` on top of the existing
   `infra/compose/docker-compose.deploy.yml` (re-parameterize, add `build:`) vs author a
   standalone local compose? — recommend the overlay to keep one parameterized source of truth.
4. **Lean vs full default profile:** should `make dev-up` default to lean (no Prometheus/Grafana,
   <16GB-friendly) or full? — recommend lean default, full opt-in.
