# VeldrixAI — Deployment & Environments

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, on-call

## Environments

| Environment | Compose file | Purpose |
|---|---|---|
| **Production** | `docker-compose.prod.yml` | Live stack behind Traefik with Let's Encrypt TLS |
| **Development (compose)** | `docker-compose.yml` | Hot-reload service development |
| **Local dev mirror (Phase 5)** | `docker-compose.dev.yml` | Free, standalone production mirror on the developer's machine (WSL2), zero cloud cost |

### Production stack (`docker-compose.prod.yml`)

Services: `traefik`, `redis`, `prometheus`, `grafana`, `postgres`, `veldrix-auth` (2 replicas), `veldrix-core` (2 replicas), `veldrix-connectors`, `veldrix-ui`. Isolated bridge network `veldrix-network`; named volumes for postgres/redis/prometheus/grafana/letsencrypt. Containers run non-root (uid 1001); secrets are environment-injected (production env file at `/opt/veldrixai/secrets/core.env`, chmod 600 — template: `backend/core/.env.production.example`).

```bash
make prod         # start production stack
make prod-logs    # tail logs
make prod-down    # stop
make health       # check all service health
make db-migrate   # connectors migrations (raw psql -f — no migration runner)
```

### Local dev mirror (Phase 5)

A standalone `docker-compose.dev.yml` that mirrors production locally, on Docker Desktop + WSL2, with **mkcert** local TLS and resources namespaced `veldrix-localdev-*` so it can never collide with real infra. Launcher: `dev-up.bat` (Windows). Guides: `DEV_LOCAL.md`, `DEV_ENVIRONMENT.md`. Env template: `backend/.env.dev.example` → `backend/.env.dev`.

**Known host failure modes (and fixes):**

| Symptom | Cause | Fix |
|---|---|---|
| Containers start but code/dirs appear empty | Docker Desktop WSL integration turned off for the distro | Re-enable WSL integration in Docker Desktop settings |
| Postgres/Redis corruption after disk-full | WSL2 VHDX ran out of space | Free space, compact the VHDX, recreate volumes |
| `veldrix.local` hostnames stop resolving | Windows `/etc/hosts` (hosts file) entries wiped by update/AV | Re-add the mkcert host entries |

## CI/CD

**GitHub Actions** gates every PR (keep-green rules):

| Gate | Rule |
|---|---|
| Lockfile sync | Frontend lockfile must match `package.json` |
| Dependency audit | Vulnerability audit must pass |
| Lint | Warn-tolerant (warnings allowed, errors fail) |
| Localhost bundle guard | Production frontend bundles must not contain `localhost` URLs |
| Backend tests | `pytest` per service; core suite currently 432 tests |
| Python lint | `ruff` clean |

A `Jenkinsfile` also exists for pipeline-based deployment.

## Branch / release state (2026-07-03)

- `main` — production baseline. **Note:** the Phase 5 local dev mirror lives only on `phase5-prod-deploy` and branches cut from it; `main` lacks it.
- `phase6-engine-integration-dev` — current working branch: Phase 6 shadow integration + the heavyweight model matrix / deterministic inference refactor.

## Deployment cautions (hard-won)

1. **Delete stale `VELDRIX_PILLAR_*_MODEL` vars** from live env files — they are intentionally not read; the canonical pattern is `VELDRIX_PILLAR_MODEL__{PILLAR}__{FIELD}` (see Configuration Reference).
2. **Connectors has no SQL migration runner** — migrations `009`/`010`/`011` ship via `psql -f` or startup `create_all`; review before deploy.
3. **`INTERNAL_SERVICE_TOKEN` must be set in connectors** or enforcement-mode changes are disabled (503) and shadow audit writes fail closed.
4. **Migration 009 (`policy_documents`/`policy_active_bindings`)** was generated and left for human review before applying.
5. Shadow integration ships **kill-switched off at 0% sample** — attaching it to traffic is an explicit operator act (see Phase 6 page).
6. `.gitignore` footguns fixed previously: a venv `Lib/` rule shadowed `frontend/lib/`, and a `Scripts/` rule shadowed dev scripts — be careful when adding broad ignore rules.
