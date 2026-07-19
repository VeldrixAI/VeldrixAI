# CICD_RUNBOOK.md — VeldrixAI Pipeline (Phase 7)

> How the Jenkins pipeline works after the Phase 7 prod-protecting changes:
> what "green" requires, how a human promotes to production, how rollback works,
> and how to activate the (currently dormant) dev auto-deploy. Companion recon:
> `RECON-CICD.md`. Evidence the prod gate consumes: `PHASE6_CLOSED.md`,
> `INTEGRATION_RUNBOOK.md` §7, `docs/evidence/phase6-closeout/`.

---

## 1. The shape of the pipeline

```
push/merge
   │
   ├─ Code Quality (ruff/mypy/bandit/safety/ESLint+tsc)      all branches
   ├─ Unit Tests (auth, core, connectors, sdk)               all branches   HARD-FAIL
   ├─ Phase 6 Proof Package (46 tests)                       all branches   HARD-FAIL
   ├─ Security Scan (semgrep/trivy)                          main
   ├─ Performance Gate (test_latency)                        main + phase*/ft/*   HARD-FAIL
   ├─ E2E (Playwright critical + AI agent)                   main + phase*/ft/*
   ├─ Build Images  :GIT_SHA8 + :latest                      main, SUCCESS only
   ├─ Push Images → GHCR                                     main, SUCCESS only
   ├─ Deploy to Dev + verify-dev.sh smoke                    main, SUCCESS only — DORMANT (§6)
   ├─ Promotion Summary (archived promotion-summary.md)      main, SUCCESS only
   └─ Prod Promotion  ◄── HUMAN INPUT GATE ──►               main, SUCCESS only, NEVER automatic
        └─ SHA-pinned deploy → droplet health check → audit record

Build with Parameters → ROLLBACK_PROD=true
   └─ Prod Rollback  ◄── HUMAN INPUT GATE ──► redeploy previous_sha (no rebuild)
```

**Nothing deploys to production without a human clicking "Promote to production"
on the Jenkins input gate.** The gate times out after 60 minutes; a timed-out or
rejected gate ABORTS the build and nothing deploys. The daily 06:00 UTC cron
build runs tests only (every deploy-adjacent stage excludes `TimerTrigger`).

## 2. What "green" requires (and why it's real now)

Green means every one of these **hard-passed** — there is no `|| true` on any
pytest anywhere, so failing tests, pytest **collection errors**, **pip install
crashes**, and **`--cov-fail-under` violations** all FAIL the build:

1. **Code Quality** — ruff clean, ESLint zero-warnings, tsc clean, no HIGH
   bandit findings, no critical/high CVEs (mypy remains advisory, as before).
2. **Unit Tests** — auth (cov ≥60), core (cov ≥60, `-m "not integration"` —
   marker-based, excludes only the 5 real-Redis circuit-breaker tests that the
   slim CI container can't serve), connectors (cov ≥40), sdk.
3. **Phase 6 Proof Package** — the canonical 46-test shadow-engine suite
   (`INTEGRATION_RUNBOOK.md` §6): isolation, zero-actuation, byte-identical
   responses attached vs detached, the 5-fault injection matrix, hot-detach
   runtime flags + fail-safe, pool wedge self-heal. In-process (fakeredis) — no
   live stack needed. **A red proof package blocks everything downstream.**
4. **Performance Gate** — `tests/test_latency.py` hard-passes.
5. **E2E** — Playwright critical-chrome blocking (Firefox + AI agent advisory,
   unchanged semantics).

An UNSTABLE or FAILED build can no longer produce artifacts: **Build Images and
Push Images gate on `currentBuild.result == SUCCESS`**, so nothing red ever
reaches GHCR — not even `:latest`.

The retired "Integration Tests" stage (which ran the nonexistent repo-root
`tests/integration/` and green-lit on zero tests) is replaced by the Phase 6
Proof Package stage. GitHub Actions PR gating (`backend-ci.yml`) now runs the
FULL core suite — the old `-k "not integration"` keyword filter that silently
excluded the proof suite is gone; the `@pytest.mark.integration` real-Redis
tests run against the workflow's Redis service container.

## 3. Prod promotion — the human-gated procedure

Prod promotion is **always** a deliberate human act on a green `main` build.

1. Merge to `main`; the pipeline runs. If anything is red, there is nothing to
   promote — fix it.
2. On green, the **Promotion Summary** stage archives `promotion-summary.md`
   on the build (also printed in the console log). It contains:
   - the candidate `:SHA` and the images it maps to,
   - what prod currently runs + `git log` of the commits being promoted,
   - proof-gate status (full suite, Phase 6 proof package, dev smoke when the
     dev droplet exists),
   - pointers to the Phase 6 evidence to review: `PHASE6_CLOSED.md` scorecard,
     `INTEGRATION_RUNBOOK.md` §7 criteria and the ≤2.5 s hot-detach flip bound,
     the Grafana renders in `docs/evidence/phase6-closeout/`,
   - the rollback plan (which `previous_sha` is retained).
3. The build pauses at the **Prod Promotion** input gate (no executor held).
   **The approver reads the promotion summary first**, then clicks
   *Promote to production* (or aborts). The approver's Jenkins ID is captured.
4. The deploy ships the **identical tested artifact**: the same `:SHA8` tag
   that passed every gate is pinned into the droplet's `.env` (`IMAGE_TAG=`)
   and pulled from GHCR — **no rebuild, and prod no longer runs `:latest`**.
5. Post-deploy: the three `/health` endpoints are checked. Failure is loud and
   fails the build with rollback instructions; the previous SHA stays retained.
6. The deploy is recorded (§5) and announced in Slack with the approver's ID.

### Ship code, do NOT attach (read this before every engine-related promotion)

Promotion deploys code carrying the Phase-6 safe defaults: **engine OFF, 0%
sample, shadow mode** — no Redis flags + no env = detached (`PHASE6_CLOSED.md`).
The deploy step never touches `veldrix:shadow:*` keys. Attaching the engine to
prod traffic is a **separate, deliberate runtime act** via the hot-detach
mechanism (`POST /internal/shadow-flags`, `INTEGRATION_RUNBOOK.md` §2–3), with
its own ≤2.5 s detach bound if you need to pull it back. A deploy must never be
the thing that attaches the engine.

### Gate mechanics worth knowing

- The input gate times out after **60 minutes** (global build cap 120 min).
  Timeout/abort = no deploy; re-run the build to get a fresh green + gate.
- `disableConcurrentBuilds` means a waiting gate queues subsequent main builds —
  don't park the gate; approve or abort.
- Promotion requires `currentBuild.result == SUCCESS` at the gate — there is no
  way to promote past a red or unstable stage.

## 4. Rollback — one action, no rebuild

The droplet retains deploy state in `/opt/veldrixai/deploy-state/`:
`current_sha` (what's running), `previous_sha` (what ran before it), and
`deploy-log.jsonl` (full history). GHCR retains every promoted `:SHA` tag.

**To roll back production:**

1. Jenkins → the pipeline job (`main`) → **Build with Parameters** →
   check **`ROLLBACK_PROD`**. Leave `ROLLBACK_TO_SHA` empty to target the
   recorded `previous_sha`, or set an explicit SHA (7–40 hex chars — pick from
   `deploy-log.jsonl` if rolling back past one deploy).
2. All build/test stages are skipped (speed is the point). The build pauses at
   the **Prod Rollback** confirmation gate — a human confirms; their ID is
   captured.
3. The target SHA is re-pinned into the droplet `.env`, pulled from GHCR
   (retained image — **no rebuild**; never use `make prod-rebuild` for
   rollback), rolled with the same compose mechanism, health-checked, and
   recorded in `deploy-log.jsonl` as `"action":"rollback"` with the approver.

Two bad deploys in a row: `previous_sha` then points at the first bad one — use
`ROLLBACK_TO_SHA` with the last-good SHA from `deploy-log.jsonl`
(`"health":"passed"` entries).

## 5. The deploy audit record

Every prod/dev deploy and every rollback appends one JSON line to
`/opt/veldrixai/deploy-state/deploy-log.jsonl` on the target droplet:

```json
{"ts":"2026-07-16T14:02:11Z","action":"deploy","environment":"prod","sha":"7141e91a","previous_sha":"eacc9da1","approver":"rudraam","build":"https://jenkins/.../42/","health":"passed"}
```

What shipped, where, when, **who approved**, and whether it came up healthy —
auditable at the source. The promotion summary is archived on the Jenkins
build; Slack messages carry the SHA + approver. No secret values appear in any
of these records (credentials stay in the Jenkins store — IDs only).

## 6. Dev auto-deploy — dormant; activation steps

The **Deploy to Dev** stage is fully authored against the cloud-dev-droplet
contract (`infra/compose/docker-compose.deploy.yml` + `infra/scripts/
verify-dev.sh`, `ENVIRONMENT=dev`) but **guarded off** by
`DEV_DROPLET_ENABLED = 'false'` in the Jenkinsfile `environment` block, because
the dev droplet has never been provisioned (`infra/terraform/` state is empty —
it costs money and is a human decision, `infra/terraform/NOT-USED-LOCALLY.md`).

It never targets the Phase 5 **local WSL2 mirror** — that builds from source on
a developer machine, is unreachable by Jenkins, and keeps its own
`verify-dev-local.sh`.

**To activate (in order):**

1. **Provision the droplet** — human-run, funded:
   `infra/terraform/APPLY-RUNBOOK.md` with `environments/dev.tfvars`
   (droplet + DNS for `api.dev.veldrixai.ca` / `dev.veldrixai.ca`).
2. **Bootstrap the droplet** per the apply runbook: docker + compose v2, the
   `deploy` user, and the rendered gateway/observability/seed directories under
   `/opt/veldrixai/` (`infra/gateway/render-gateway.sh` with the dev hosts +
   LE-staging resolver).
3. **Create the two dev credentials in Jenkins** (names, never values):
   - `VELDRIX_DEV_ENV_FILE` — secret file from `infra/compose/.env.deploy.example`
     filled with **dev-scoped secrets, all distinct from prod** (the example's
     rules block is binding). Must contain `ENVIRONMENT=dev` — the deploy stage
     refuses to act on an env file that isn't dev-scoped.
   - `veldrix-dev-ssh-key` — SSH private key for the droplet's `deploy` user.
4. **Flip the guard**: change `DEV_DROPLET_ENABLED = 'false'` → `'true'` in the
   Jenkinsfile `environment` block via a reviewed PR (deliberately a code
   change, not a build parameter — activation should leave a diff).
5. From then on: **green `main` auto-deploys the tested `:SHA` to dev** (no
   human gate — dev is the fast path; only PROD is human-gated), runs
   `verify-dev.sh` (parity, isolation-from-prod, chain-health, stub inference,
   drift), and a failed smoke fails the build — which **blocks prod promotion**
   for that artifact. The promotion summary switches from "dev smoke N/A" to
   the real result.

## 7. Constants the pipeline relies on

| Thing | Value | Where |
|---|---|---|
| Image names | `ghcr.io/veldrixai/veldrixai-{auth,core,connectors,frontend}` | Jenkinsfile env + compose defaults |
| Tag scheme | `:SHA8` (immutable, deployed) + `:latest` (still pushed, **never deployed**) | Build/Push stages |
| Prod target | `deploy@api.veldrixai.ca:/opt/veldrixai` (agent-resident SSH key) | `PROD_SSH_TARGET` |
| Dev target | `deploy@api.dev.veldrixai.ca:/opt/veldrixai` (`veldrix-dev-ssh-key`) | `DEV_DROPLET_HOST` |
| Prod compose | `docker-compose.prod.yml` (existing mechanism, now SHA-pinned via `IMAGE_TAG` in `.env`) | Prod Promotion stage |
| Dev compose | `infra/compose/docker-compose.deploy.yml` (`ENVIRONMENT=dev`, stub profile) | Deploy to Dev stage |
| Deploy state | `/opt/veldrixai/deploy-state/{current_sha,previous_sha,deploy-log.jsonl}` | both droplets |
| Proof suite | 5 files, 46 tests — `INTEGRATION_RUNBOOK.md` §6 | Phase 6 Proof Package stage |

**Note on the deploy overlay for prod:** prod deliberately stays on
`docker-compose.prod.yml` (SHA-pinned through `.env`) rather than migrating to
`docker-compose.deploy.yml` with `ENVIRONMENT=prod`, because the overlay
namespaces volumes as `veldrix-prod-*` while live prod data lives in the
unsuffixed `veldrix-postgres-data` etc. — a silent switch would bring prod up
on **empty volumes**. Migrating prod onto the overlay is a separate, planned
operation requiring a volume-migration step; do not do it as a side effect of
a deploy.
