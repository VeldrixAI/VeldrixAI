# RECON-CICD.md — Phase 7 Reconnaissance: the existing Jenkins/deploy reality

> **Read-only reconnaissance for `14-cicd-pipeline.md` (Phase 7).** Maps the pipeline
> that exists TODAY — before extending it into build-once → auto-dev-deploy →
> human-gated prod promotion. No pipeline code was written; no deploy was triggered.
> All references are `file:line` in this repo at commit `7141e91` (branch
> `phase6-engine-integration-dev`). Secret **names only** appear here — never values.

---

## Finding 1 — The existing Jenkinsfile: structure, agents, and how prod deploy fires today

One declarative pipeline at the repo root: `Jenkinsfile` (651 lines), `agent none` with
per-stage agents (`Jenkinsfile:25`), 60-min timeout + `disableConcurrentBuilds`
(`Jenkinsfile:27-33`), a daily cron health-run at ~06:00 UTC (`Jenkinsfile:38-40`).

Nine stages:

| # | Stage | When | Agent | Ref |
|---|---|---|---|---|
| 1 | Code Quality (ruff / mypy / bandit / safety / ESLint+tsc, parallel) | all branches, not cron | `python:3.11-slim` / `node:20-slim` | `Jenkinsfile:69-173` |
| 2 | Unit Tests (auth, core, connectors, sdk) | all branches | `python:3.11-slim` | `Jenkinsfile:178-244` |
| 3 | Integration Tests | `develop`/`main`/`release/*`/cron | python + docker.sock | `Jenkinsfile:249-289` |
| 4 | Security Scan (semgrep / trivy, parallel) | `main` only | python / `docker-available` | `Jenkinsfile:294-360` |
| 5 | Performance Gate (`test_latency.py`) | `develop`/`main`/cron | `python:3.11-slim` | `Jenkinsfile:365-385` |
| 6 | E2E (Playwright critical + AI agent) | `main`/`develop`/cron | playwright image | `Jenkinsfile:390-485` |
| 7 | Build Images (auth, core, connectors, frontend) | `main` only | `docker-available` | `Jenkinsfile:490-521` |
| 8 | Push Images → GHCR | `main` only | `docker-available` | `Jenkinsfile:526-545` |
| 9 | **Deploy to Production** | `main` only | `docker-available` | `Jenkinsfile:550-599` |

**How prod deploy fires today: automatically.** Stage 9's only guards are
`branch 'main'`, `currentBuild.result == null || 'SUCCESS'`, and not-cron
(`Jenkinsfile:551-557`). There is **no `input` step, no human approval, anywhere** —
a merge to `main` that stays green ships straight to the live droplet. This is
exactly the behavior Phase 7 replaces with a human gate.

Post-pipeline: Slack success/failure notification (`Jenkinsfile:604-618`), Playwright
HTML + Allure publishing, `cleanWs()` (`Jenkinsfile:620-648`).

## Finding 2 — GHCR image build/tag scheme + the SSH-to-droplet deploy step to reuse

**Registry + tag scheme** (`Jenkinsfile:55-61`):
- `DOCKER_REGISTRY = ghcr.io/veldrixai` (`Jenkinsfile:57`)
- `IMAGE_TAG = GIT_COMMIT.take(8) ?: 'latest'` (`Jenkinsfile:58`) — **8-char git SHA
  tags already exist**; the deterministic-tag requirement of §2.1 is already half-built.
- Images: `ghcr.io/veldrixai/veldrixai-{auth,core,connectors,frontend}` — built with
  BOTH `:${IMAGE_TAG}` and `:latest` (`Jenkinsfile:497-518`), pushed as both
  (`Jenkinsfile:536-541`). Compose defaults agree:
  `${DOCKER_REGISTRY:-ghcr.io/veldrixai/veldrixai}-auth:${IMAGE_TAG:-latest}`
  (`docker-compose.prod.yml:156,205,247,292`; `infra/compose/docker-compose.deploy.yml:127,167,212,250`).
- Backend Dockerfiles are multi-stage with a `production` final stage
  (`backend/core/Dockerfile:2,17,25`); Jenkins builds without `--target` so it gets
  the last stage (= production), while compose files pin `target: production`
  explicitly (`docker-compose.prod.yml:160,209,251`).

**The deploy step to reuse** (`Jenkinsfile:559-597`): installs `doctl` + auths with
`DIGITAL_OCEAN_PAT` (`Jenkinsfile:566-568` — note: doctl is auth'd but never actually
used for the deploy; vestigial), then:
1. `scp docker-compose.prod.yml + $ENV_FILE → deploy@api.veldrixai.ca:/opt/veldrixai/` (`Jenkinsfile:571-574`)
2. `ssh deploy@api.veldrixai.ca` → `docker-compose pull` → `up -d --no-deps --remove-orphans` → `sleep 10` → curl the three `/health` endpoints (`Jenkinsfile:576-595`).

**Tag pinning gap:** the droplet's compose resolves `IMAGE_TAG` from `/opt/veldrixai/.env`
— and the shipped env file (from the `VELDRIX_ENV_FILE` credential) is not known to set
it, so the droplet pulls **`:latest`** (`docker-compose.prod.yml:156` default). The
environment-parameterized overlay `infra/compose/docker-compose.deploy.yml` +
`infra/compose/.env.deploy.example:24-25` already model explicit `DOCKER_REGISTRY`/
`IMAGE_TAG` pinning — the shape Phase 7 needs.

## Finding 3 — What "green" means today, and where the Phase 6 proof tests live

**Jenkins "green" is weaker than it looks.** Every pytest invocation in Unit Tests,
Integration Tests, and Performance Gate is suffixed `|| true`
(`Jenkinsfile:192,205,219,235,277,376`). Failures surface only via `junit` XML
publishing (`Jenkinsfile:241,285,382`), which marks the build **UNSTABLE** rather than
FAILED. Consequences, verified in the `when` clauses:
- The **Deploy** stage is blocked on UNSTABLE (`Jenkinsfile:554`) — good.
- The **Build + Push** stages are NOT (`Jenkinsfile:491,527` — branch/timer conditions
  only): an UNSTABLE main build still pushes `:latest` to GHCR, so any later manual
  `docker-compose pull` on the droplet picks up an image whose tests failed.
- Swallowed entirely (no junit XML produced): pip install crashes, pytest collection
  errors, and `--cov-fail-under` violations.
- The Integration Tests stage runs repo-root `pytest tests/integration/`
  (`Jenkinsfile:275-277`) — **that directory does not exist** (repo-root `tests/`
  contains only `agent_validation/`, `e2e_verification.py`, `test_resend.py`). The
  stage green-lights on zero tests.

**GitHub Actions is the second CI**: `.github/workflows/{ci,backend-ci,frontend-ci,publish-sdk}.yml`
gate PRs to `main` (`backend-ci.yml:3-10`) — lockfile sync, audit, lint, per-service
pytest. Note the core job uses `-k "not integration"` (`backend-ci.yml:96`), a
**keyword** filter that excludes anything with "integration" in its path — including
the Phase 6 integrated-system suite.

**Where the Phase 6 proof suite lives** (the suite §2.1 must fold into "green") —
canonical invocation at `INTEGRATION_RUNBOOK.md:167-172`, 46 tests
(`PHASE6_CLOSED.md:84-87`), all under `backend/core/`:
- `tests/test_shadow_integration.py` (isolation, zero-actuation, controls)
- `tests/integration/test_shadow_integrated_system.py` (integrated system + the
  5-fault injection matrix) — carries **no `integration` pytest marker** (verified),
  so Jenkins' `-m "not integration"` (`Jenkinsfile:190,203,217`) does include it in
  Unit Tests… behind the same `|| true`.
- `tests/test_shadow_tap_wiring.py` (byte-identical response attached vs detached)
- `tests/test_shadow_flags.py` (hot-detach runtime flags, fail-safe-detached)
- `tests/test_shadow_pool_selfheal.py` (pool wedge self-heal vs genuine saturation)

Live drivers (dev-stack evidence, not CI-runnable against prod):
`backend/core/scripts/shadow_shed_load.py`, `backend/core/scripts/shadow_hot_detach_live.py`
(`PHASE6_CLOSED.md:11-13`). Full core suite at close: 448 passed (`PHASE6_CLOSED.md:87`).

## Finding 4 — Branch → environment mapping today (how anything reaches prod)

Declared strategy (`Jenkinsfile:9-12`): `feature/*` = lint+unit; `develop` = full
suite, no deploy; `main` = full suite + build + push + **auto-deploy to prod**
(`Jenkinsfile:491,527,551`).

Reality checks:
- **No `develop` branch exists** (verified via `git branch -a`) — every `develop`
  `when` clause (`Jenkinsfile:251,367,392`) is dead. Actual work flows through
  `phase*` and `ft/*` branches.
- **`main` is stale relative to the phase work**: `main`'s tip predates Phases 5–6;
  the dev mirror, deploy overlay, verify scripts, and the whole shadow engine live
  only on `phase5-prod-deploy`-lineage branches
  (`docs/confluence/VeldrixAI - Deployment and Environments.md:54-55`). So today
  "reaching prod" = merging to `main`, which auto-fires stage 9 — and the Phase 7
  pipeline itself cannot gate anything until its branch lands there.
- **No branch deploys to dev.** There is no dev deploy stage at all; `IMAGE_TAG=dev`
  is modeled in `infra/compose/.env.deploy.example:25` and
  `infra/terraform/environments/dev.tfvars:27` but nothing builds or pushes a `dev` tag.

**⚠️ Decision required at review — what "auto-deploy to dev" targets.** The prompt says
"the dev environment (the Phase-5 mirror)", but two different "devs" exist:
1. **The local WSL2 mirror** (`docker-compose.dev.yml`, `make dev-up`,
   `infra/scripts/verify-dev-local.sh`) — builds **from source on the developer's
   machine** (`Makefile:70-73`), does not consume GHCR artifacts, and is not reachable
   by a cloud Jenkins. As-is it cannot receive a pipeline artifact deploy.
2. **The cloud dev droplet** (`infra/compose/docker-compose.deploy.yml` +
   `infra/terraform/` + `infra/scripts/verify-dev.sh`, hosts `api.dev.veldrixai.ca`) —
   purpose-built for exactly this (registry images, `ENVIRONMENT=dev` namespacing,
   `verify-dev.sh` smoke), but **never provisioned**: `infra/terraform/terraform.tfstate`
   has `"resources": []` (outputs only, serial 3 — plans were run, apply was not), and
   `infra/terraform/NOT-USED-LOCALLY.md:1-16` marks it the deferred, human-run,
   costs-money path (`APPLY-RUNBOOK.md` has the steps).
   The §2.2 requirement to "reuse `verify-dev.sh`" matches THIS target, not the local
   mirror (which has its own `verify-dev-local.sh`).
   Options: (a) fund + apply the dev droplet, (b) point the dev deploy at a Jenkins
   agent running on the dev host, or (c) author the dev-deploy stage against the
   deploy overlay + `verify-dev.sh` contract now and activate when the droplet exists.

## Finding 5 — How Jenkins injects secrets (credential IDs only)

All via the Jenkins credential store with `credentials()` / `withCredentials` — no
values in the repo (verified: the Jenkinsfile contains IDs only):

| Credential ID | Kind | Used at |
|---|---|---|
| `DOCKER_HUB_CREDS` | username/password (GHCR login) | `Jenkinsfile:530-536` |
| `DIGITAL_OCEAN_PAT` | secret text | `Jenkinsfile:561,566-568` |
| `VELDRIX_ENV_FILE` | secret file (= prod `.env`, scp'd to the droplet) | `Jenkinsfile:562,571-574` (also `Jenkinsfile:255` for integration tests) |
| `veldrix-ci-email` / `veldrix-ci-password` | secret text (E2E test user) | `Jenkinsfile:401-402` |
| `anthropic-api-key` | secret text (agent tests) | `Jenkinsfile:403` |
| `slack-webhook-url` | secret text | `Jenkinsfile:404,606,614` — header comment says `SLACK_WEBHOOK_URL` (`Jenkinsfile:18`); the actual ID is lowercase-hyphenated |

SSH to the droplet rides on the `deploy@api.veldrixai.ca` identity with
`StrictHostKeyChecking=no` (`Jenkinsfile:571-576`) — the key is agent-resident, not a
declared Jenkins credential. A dev-droplet deploy will need its own SSH credential and
a **dev-scoped** env-file credential (secrets must stay distinct per
`infra/compose/.env.deploy.example:7-10`).

## Finding 6 — Rollback today: none

- No `rollback`/`previous`/`revert` logic exists in `Jenkinsfile` or `Makefile`
  (grep-verified; the only "roll" is the "rolling update" comment `Jenkinsfile:584`).
- The droplet runs whatever `docker-compose pull` last fetched — effectively
  **`:latest`** (Finding 2), which every main build overwrites (`Jenkinsfile:539`).
  `:latest` is not a rollback point.
- The raw material exists: immutable `:SHA` tags are pushed on every main build
  (`Jenkinsfile:538`), so previous known-good images ARE in GHCR — but nothing records
  which SHA is "current prod" vs "previous good", and the droplet compose isn't pinned
  to any SHA. `make prod-rebuild` (`Makefile:157-160`) rebuilds from source on the
  droplet — the opposite of artifact rollback.
- Phase 7 rollback therefore = pin the droplet to explicit `IMAGE_TAG=<sha>` (the
  deploy overlay already supports it), retain previous-good, redeploy previous tag as
  a single Jenkins action.

## Finding 7 — The Phase 6 proof artifacts the prod gate consumes

The promotion summary (§2.3) surfaces these for the human approver:

1. **`PHASE6_CLOSED.md`** — the scorecard: 7 promote-to-prod criteria with live
   evidence (`PHASE6_CLOSED.md:19-27`), live-run findings (`:34-62`), constraint
   compliance (`:65-81`), verification state (46/46 proof package, 448 core suite,
   live drivers PASSED — `:84-92`).
2. **`INTEGRATION_RUNBOOK.md` §7** — the six "ready to promote to prod" criteria
   (`INTEGRATION_RUNBOOK.md:187-208`), all marked live-proven 2026-07-15; §2–3 document
   the hot-detach flip bound (≤2.5 s) the approver should know before any prod ramp.
3. **Evidence renders** — `docs/evidence/phase6-closeout/`:
   `shed-proof-saturation-shed-impactguard.png`, `hot-detach-and-failsafe.png`,
   `full-closeout-session.png` (Grafana dashboard uid `ffs4g8go83474b`,
   `PHASE6_CLOSED.md:9-10`).
4. **The proof test suite** (Finding 3 list) — re-runnable green on the exact artifact
   being promoted; this is the machine-checkable half of the gate.
5. **Safe-default posture proof** — no keys + no env = OFF / 0% / shadow
   (`PHASE6_CLOSED.md:80-81`); promotion ships code that stays detached until the
   separate runtime-flag act (`docs/confluence/VeldrixAI - Deployment and Environments.md:63`).

---

## Summary of gaps Phase 7 must close (recon → design input)

| Gap | Today | Phase 7 target |
|---|---|---|
| Prod gate | Auto-fires on green `main` (`Jenkinsfile:550-557`) | Jenkins `input` human approval, proof-gated |
| Green integrity | `\|\| true` + junit-UNSTABLE; build/push ignore UNSTABLE; ghost integration dir | Hard-fail tests; UNSTABLE never pushes; fix/retire dead stages |
| Proof suite in CI | Shadow package incidentally in unit stage, swallowed | Explicit, hard-failing Phase 6 proof-package stage |
| Dev deploy | None (no dev tag built, no dev target decided) | Auto-deploy on green + `verify-dev.sh` smoke — **needs the Finding 4 decision** |
| Artifact discipline | `:latest` deployed; SHA tags pushed but unused | Build once, promote the identical `:SHA` to dev then prod |
| Rollback | None; `:latest` overwritten each build | Previous-good SHA retained; one-action redeploy |
| Deploy audit | Slack ping only (`Jenkinsfile:604-618`) | Recorded what/where/SHA/approver |

**STOP point reached** — awaiting review of this recon (especially the Finding 4
dev-target decision) before any pipeline code.
