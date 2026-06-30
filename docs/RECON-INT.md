# RECON-INT.md — Phase 6 Reconnaissance (READ-ONLY)
## Engine Integration **in Dev** — Out-of-Band Shadow Connection, **connectors-first**

**Status:** Phase 0 recon only. No integration code written. **STOP for review after this file.**
**Date:** 2026-06-30 · **Base:** `9ae49c1` · **Branch:** `phase5-prod-deploy` · **Target:** dev only (local Compose)
**Supersedes:** the prior prod-targeted `RECON-INT.md` (2026-06-19), which recommended *core-first*.
Phase 6 re-mandates **connectors-first**; this recon maps the dev reality of that mandate and
surfaces the one decision the reviewer must make before any code is written.

> Purpose: find the single safest out-of-band tap in the **connectors** service where the Policy
> Engine can observe real *dev* traffic **after** the response is finalized, consuming
> already-computed (dev-stubbed) signals, recording `enforced:false` decisions through the hash
> chain, with **zero** added latency and **zero** failure modes on the request path.

---

## TL;DR — the recommendation, and the one decision for review

1. **First tap point: the internal audit-trail write route**
   `POST /api/audit-trails/internal/audit-trail` — `backend/connectors/src/modules/analytics/audit_controller.py:396` (`internal_log_audit`). This *is* "the connectors live surface where the audit substrate lives": every governed dev request from `core` lands here, carrying its already-computed pillar signals inside `metadata`. The shadow eval fires **after** the `201` insert is finalized (Finding #1).

2. **⚠ THE DECISION FOR REVIEW — the engine is not present in connectors.** The proven engine lives *only* in `backend/core/src/policy/` (`engine.py`, `context.py`, `schema.py`, `evaluator.py`, `runtime.py`, metrics). Connectors is a **separate build context / image / container** (`docker-compose.dev.yml:166-184`, context `./backend/connectors`, mount `./backend/connectors:/app`) with no import of it and no engine deps in `requirements.txt`. **Connectors literally cannot `import` the engine today.** Running the engine *inside connectors* (literal connectors-first) requires first making the engine importable there — **without modifying its decision logic** (hard constraint §5). This is the single largest call and is detailed in Finding #3. My recommendation: **vendor the engine as a read-only shared package** installed into both images (no edits, checksum-pinned); copy-in is the lower-effort dev-only fallback. The reviewer must pick the mechanism before build.

3. **Dispatch primitive differs from core.** Core's fire-and-forget idiom is `asyncio.create_task`. But the connectors write route is a **sync `def`** with a sync DB `Session`, and connectors has **no existing background-dispatch primitive** (no `BackgroundTasks`, no worker). The out-of-band hand-off must therefore use FastAPI's framework-native **`BackgroundTasks`** (a built-in post-response hook, *not* a new queue system) — Finding #2.

4. **Signals arrive lossy.** Core writes a *flattened, normalized* projection (`pillar_scores`/`overall_score`, frontend keys), **not** `PillarResult` objects. The engine's `SignalContext.from_pillar_results` adapter can't be used as-is; a new `from_audit_metadata` adapter is needed, and it sees less fidelity than the core tap (Finding #5).

5. **Shared-pool back-pressure risk (the sneakiest coupling):** the connectors DB pool is small — `pool_size=10, max_overflow=20` (`db/base.py:13-21`). A shadow worker that draws a `Session` to write its record (or read mode) competes with request handling for that pool. This must be bounded + shed + counted (Finding #6).

---

## Finding #1 — The connectors request path; the post-response point where signals exist

Connectors is the **Reports / audit / analytics API** (`main.py:121-170`), not the inference path.
Its routers: reports, analytics, audit-trails, chain-health, latency, policy-rollout, metrics,
prompts, models, support. None of these *compute* pillar signals — but **one receives them**.

**Tap = `POST /api/audit-trails/internal/audit-trail`** (`audit_controller.py:396-452`):
- Token-gated internal route (Finding #4). Body is `InternalAuditRequest{action_type, entity_type,
  entity_id, user_id, actor_email, metadata}` (`audit_controller.py:387-393`).
- It dedups on `(request_id, action_type)` (`:429-437`), then `_insert_with_chain(db, entry)`
  (`:443`) links the row into the per-tenant hash chain under a `pg_advisory_xact_lock`
  (`_insert_with_chain` at `:337-`), and **returns the `201` `{ok, id, inserted}`** (`:448`).
- **The response is finalized at `:448`.** A shadow evaluation scheduled to run *after* that
  return (via `BackgroundTasks`, Finding #2) cannot touch the response — it executes once the
  insert has committed and the body is sent.
- **Why this is the right surface:** every governed request in dev that reaches the engine's
  consumers writes here. `metadata` carries the already-computed signal projection that `core`
  produced *before its own response returned* (see Finding #5). Tapping here adds the shadow
  evaluation as a second post-response side-effect alongside the chain insert that already happens.

**Route shape caveat:** `internal_log_audit` is a **synchronous** `def` (`:397`) using `Session =
Depends(get_db)`. It runs in Starlette's threadpool, so `asyncio.create_task` is not the idiom here
— see Finding #2.

---

## Finding #2 — Existing async/background infrastructure to reuse (NO new queue)

- **Connectors has no background-task primitive of its own.** Grep for `BackgroundTasks` /
  `asyncio.create_task` / worker / queue in `backend/connectors/src` returns **nothing** on a
  request path. The only async in connectors is `httpx.AsyncClient` *inside* the async
  intelligence/prompts routes (`audit_controller.py:157,300`; `prompts/*`), which are unrelated.
- The internal write route is sync, so core's `asyncio.create_task` idiom (used in
  `core/src/api/trust_controller.py` and `policy/audit_bridge.py:100`) does **not** transplant.
- **The framework-native, zero-new-system choice is FastAPI `BackgroundTasks`** — add a
  `background_tasks: BackgroundTasks` param to the route and `background_tasks.add_task(...)` the
  shadow eval. FastAPI runs queued tasks **after the response is sent**; a sync task runs in the
  threadpool, an async task on the loop. This is a built-in framework hook, not a Celery/Redis/new
  worker — it satisfies "reuse, don't introduce a new queue."
- **Bounding is on us.** `BackgroundTasks` has no concurrency ceiling, no per-task timeout, no
  shed-and-count. The Phase-2 backpressure/timeout/shed primitives that provide those
  (`core/src/policy/runtime.py:62-64,88-105,162-201`: `Semaphore`, `POLICY_EVAL_BUDGET_MS=250`,
  `POLICY_MAX_CONCURRENT_EVALS=64`, `BackpressureError`, `metrics.record_shed`) live in **core** and
  travel only if the engine is vendored (Finding #3). The build must apply an equivalent bound in
  connectors (a module-level `Semaphore` + `asyncio.wait_for` budget) before dispatching, sheds +
  counts beyond it, and strong-references in-flight tasks (the `_INFLIGHT` pattern,
  `audit_bridge.py:106-107`).

**Conclusion:** dispatch = `BackgroundTasks.add_task(_shadow_evaluate, …)` guarded by a bound +
kill-switch + %-gate read at dispatch time. No new queue system.

---

## Finding #3 — Engine entry signature + Policy source ⚠ (THE key decision)

**The engine the worker would call:** `core/src/policy/runtime.py::evaluate(...)` (`:120`) — the
Phase-2 Part-B host: bounded-concurrency backpressure (`:162-177`), hard per-eval timeout budget
(`:181-201`), breaker awareness (`:209-217`), fail-safe mode resolution, and one `actuated:false`
audit record. The pure decision is `engine.PolicyEngine` consuming a `SignalContext` against a
`Policy`.

**The blocker:** *all of this is in the `core` source tree and the `core` image only.* Connectors
cannot import it (TL;DR #2). So the literal connectors-first build requires one of:

- **(A) Vendor the engine as a shared, read-only package** (recommended): extract `policy/`
  (engine, context, schema, evaluator, resolution) + the runtime/metrics into an installable
  package both images depend on, **with zero edits to decision logic** (constraint §5). Cleanest;
  single source of truth; honours "this phase *calls* the engine." Cost: a packaging task + adding
  the dep to `connectors/requirements.txt` and a Dockerfile rebuild.
- **(B) Copy `policy/` into connectors verbatim**, pinned + checksum-verified, no edits. Lower
  effort for a dev-only proof; risk = drift between the two copies. Acceptable *only* because this
  is dev and a later prod-promotion phase can consolidate.
- **(C) (rejected for Stage 1, noted for the reviewer)** Run the engine in **core** observing
  core's in-scope `PillarResult`s and write the shadow record to connectors' audit endpoint — the
  prior recon's core-first design. This is the *technically cheapest and highest-fidelity* path
  (engine + native signals already co-located in core), but it **contradicts the explicit
  connectors-first mandate** and would make Stage 1 == the old Stage 2. Flagged so the reviewer can
  consciously reaffirm connectors-first or pivot.

**Policy source:** unchanged from prior recon — there is **no production Policy loader**.
`runtime.evaluate(policy=…)` needs a `Policy`; `policy/schema.py` offers only programmatic
construction (no `from_dict`/`from_yaml`). Connectors migrations `009/011` define
`policy_documents`/bindings but have no loader. The build must supply a **bundled default shadow
policy** constructed in code (versioned + checksummed), wherever the engine ends up running.

**Recommendation:** **(A)** vendor as a shared package; fall back to **(B)** if packaging is out of
scope for the dev proof. Decide before build.

---

## Finding #4 — The token-gated audit-write entry

- Endpoint: `POST /api/audit-trails/internal/audit-trail` (`audit_controller.py:396`).
- Gate: `Depends(require_internal_token)` (`:400`) → `core/middleware/internal_auth.py:21-34`.
  **Token env var = `INTERNAL_SERVICE_TOKEN`; header = `X-Internal-Token`.** Fail-safe: unset →
  route disabled (503), wrong → 401.
- **Correction to the prompt's carry-forward:** the prompt names the internal token
  `VELDRIX_INTERNAL_API_KEY`. That is a **different** token — it gates *core's* `/internal` and
  `/api/v1/analyze` API-key paths (`core/src/api/internal.py:22`, `config/__init__.py:22`). The
  connectors audit-write path the worker uses is gated by **`INTERNAL_SERVICE_TOKEN`** and core
  attaches it via `core/src/core/http_pool.py:37` (`X-Internal-Token`). The build must use
  `INTERNAL_SERVICE_TOKEN` for this route.
- Hash chain + idempotency are already provided by `_insert_with_chain` (`:337-`) under a
  `pg_advisory_xact_lock` and the `(request_id, action_type)` dedup (`:429-437`). **No change to the
  audit substrate is needed** — the shadow record is just another `internal_log_audit` insert with
  its own `action_type` (e.g. `policy_decision_shadow`).

---

## Finding #5 — Are signals already computed in the live path? (Yes — but the connectors tap sees a *lossy projection*; never recompute)

- **Yes, signals are pre-computed and arrive in `metadata`.** Core computes pillar results +
  composite *before its own response returns*, then `asyncio.create_task(_record_audit_trail(...))`
  (`core/src/api/trust_controller.py:252`) POSTs to the connectors internal write. The metadata it
  writes (`trust_controller.py:119-126`) contains: `overall_score` (composite), `pillar_scores`
  (per-pillar, **normalized 0-1**, **frontend keys**), `pillar_confidence`, `per_pillar_ms`,
  `response_preview[:300]`, and an action category.
- **In dev these are deterministic** (`VELDRIX_INFERENCE_MODE=stub`, `docker-compose.dev.yml:145`;
  stub service at `infra/mock-inference`) — ideal for exact behavior assertions.
- **No new inference at the tap.** The shadow worker reads the metadata that already exists; it must
  never call `route_inference()` or trigger a pillar (constraint §5). `route_inference` lives in
  `core/src/inference/` and runs only during core's own evaluation — never reachable from connectors.
- **Fidelity caveat (important for the connectors-vs-core decision):** the engine's native adapter
  `SignalContext.from_pillar_results` (`context.py:140-187`) derives `evaluated` from rich
  `PillarResult` fields — `status`, `details["method"]=="demographic_fast_path"`,
  `details["fallback"]` — to *suppress* skipped/degraded scores. **The flattened audit metadata
  preserves none of those**; it has only normalized scores + confidence. So a connectors-side
  `SignalContext.from_audit_metadata(...)` adapter (new, build-phase) must infer `evaluated` from
  presence/confidence and will be **less faithful** than the core tap. `SignalContext` does accept a
  generic `values={…}` constructor (`context.py` dataclass), so building the context from the
  projection is mechanically possible — but the reviewer should weigh this fidelity loss as a real
  cost of connectors-first. Missing/degraded fields → record them `evaluated:false`, fail-closed in
  the record (nothing gates anyway). **Do not recompute.**

---

## Finding #6 — Residual back-pressure: the shared connectors DB pool (sneakiest coupling)

The dispatch is post-response, but resource sharing can still couple worker load to request handling:

1. **Shared SQLAlchemy connection pool (primary risk).** `db/base.py:13-21` configures
   `pool_size=10, max_overflow=20` (hard ceiling 30), `pool_timeout=30`. Every request route draws a
   `Session` from this pool via `get_db()`. A shadow worker that opens its own `Session` to (a) read
   the tenant mode (`mode_service.get_mode(db, …)`, `:141-148`) and/or (b) write its record competes
   for the *same* 30 connections. Under worker load this can starve request-path inserts/reads —
   "out-of-band on paper, pool-coupled in practice." *Mitigation for build:* bound worker concurrency
   to a small fraction (e.g. a `Semaphore` ≪ `max_overflow`), shed + count beyond it, and **strongly
   consider a dedicated small engine pool / session factory** so the worker can never consume
   request-path connections. The internal write the worker performs should reuse the existing
   idempotent insert path, but on its *own* session.
2. **Unbounded `BackgroundTasks` spawn.** No ceiling at the dispatch site (Finding #2). The %-gate
   **must be evaluated before `add_task`** so un-sampled requests never even allocate a task, and the
   bound must shed-and-count above the gate.
3. **Threadpool saturation.** Sync `BackgroundTasks` run in Starlette's threadpool, shared with all
   sync routes (the connectors write route itself is sync). A slow/hung eval occupying threadpool
   workers can throttle sync request handling. *Mitigation:* hard per-eval timeout (port the
   `POLICY_EVAL_BUDGET_MS=250` budget) + prefer an async task so the loop, not the threadpool, hosts
   the wait; keep the engine call CPU-cheap (it is sub-ms once signals are in hand).
4. **GC of in-flight tasks.** Strong-reference dispatched tasks (`_INFLIGHT` pattern,
   `audit_bridge.py:106-107`) to avoid mid-flight collection.

**No path back-pressures the request path *by construction*:** the tap is after the `201` return,
the worker sheds rather than queues, the eval is timeout-bounded, and (with mitigation 1) the worker
uses an isolated DB session/pool.

---

## Finding #7 — Kill switch + traffic-% flag home (read at dispatch time)

- **Connectors already reads `os.getenv` at request time** for behavior flags
  (`VELDRIX_INFERENCE_MODE` at `audit_controller.py:185`; `INTERNAL_SERVICE_TOKEN` at
  `internal_auth.py:27`), so request-time flag reads are idiomatic here — no restart needed to flip.
- **Global kill switch:** new env flag (proposed `ENGINE_SHADOW_ENABLED`, default **off**) read at
  dispatch in the route, *above* per-tenant mode — detaches the engine from **all** traffic
  instantly. First-run posture: attached to **0%**.
- **Traffic-% gate:** new env flag (proposed `ENGINE_SHADOW_SAMPLE_PCT`, default **0**), evaluated
  **before** `add_task` (Finding #6.2). In dev, ramp freely to 100% to load-test; the mechanism is
  what later gets promoted to prod.
- **Per-tenant honoring:** the tenant's resolved mode is read from connectors' own
  `mode_service.get_mode(db, tenant_id, policy_id)` (`:141-148`, default `shadow`) — connectors can
  resolve mode **locally**, no call to core. Kill + % compose on top; an unconfigured tenant stays
  `shadow`. **Record the real resolved mode for honesty, but force `enforced:false` on every record**
  (observation only); there is no worker→response path regardless.

---

## What the build phase will add (preview — NOT built; for reviewer context)

In **connectors** (Stage 1), reusing existing infra where it exists:
- A decision on Finding #3 (vendor vs copy the engine) — **blocking**.
- A bundled default **shadow policy** (versioned + checksummed) and a `SignalContext.from_audit_metadata`
  adapter (Finding #5).
- A thin `_shadow_evaluate()` dispatched via `BackgroundTasks` from `internal_log_audit`, behind a
  module-level concurrency bound + per-eval timeout (ported from `runtime.py` budgets), shed-and-count,
  on an **isolated DB session/pool** (Finding #6).
- Kill switch + %-gate + per-tenant mode honoring, all read at dispatch time (Finding #7).
- Record markers: real `mode`, forced `enforced:false`, carried `actuated:false`, new
  `integration:shadow`; written through the existing hash chain via `internal_log_audit` (Finding #4).
- Connectors-side metrics (connectors has its own `/metrics` at `main.py:173` + `prometheus_client`):
  **request-path dispatch-impact guard** (~0 hand-off latency — the metric that proves the
  out-of-band promise), worker eval latency, decisions by verb/mode, dropped/un-sampled counters,
  worker exception count, sampled-% gauge; a "shadow on dev traffic" Grafana panel. No PII in telemetry.
- The integrated-system test suite (mode-change race, concurrent `/metrics` scrape, back-pressure
  under load, deliberate fault injection) + `INTEGRATION_RUNBOOK.md`.

Stage 2 (core, separate PR, only after Stage 1 proven) reuses the Stage-1 worker pattern against the
core request path, where the engine + native `PillarResult` signals already co-reside.

---

**Nothing above is implemented in this commit.** The two calls the reviewer must make:
**(1) the engine-availability mechanism in Finding #3 (vendor vs copy vs reaffirm/pivot connectors-first),
and (2) the DB-pool isolation in Finding #6.** Awaiting review before any integration code.

---
---

# RECON-INT — Core-Tap Confirmation (Phase 6, post-pivot)

**Date:** 2026-06-30 · **Decision:** the reviewer **pivoted to CORE-FIRST** (see locked decisions in
`12b-engine-integration-dev-core-first.md`). Connectors-first is deferred to a later engine-vendoring
phase. This section confirms the **core** tap specifics (file:line) before any integration code.
**Bottom line: the core tap is cleaner than the connectors tap on every axis — engine is native,
signals are real `PillarResult`s, and the Phase-2 primitives are in-process — but one locked decision
needs reframing for core's reality (it is DB-less). Flagged below as ⚠C-2.**

## C-1 — Core's request path + the response-finalization point (tap fires AFTER)

Two POST request paths in core; both finalize the response, then fire post-response side-effects:

- **Path A (RECOMMENDED FIRST) — `POST /trust/evaluate`** — `backend/core/src/api/trust_controller.py:146`.
  - Real signals in scope: `report.pillar_results` (`{pillar_id: PillarResult}`) from
    `trust_service.evaluate_trust(...)`, and `composite_trust_score = compute_composite_trust_score(report.pillar_results)` (`trust_controller.py:244`).
  - **Existing post-response fire-and-forget block:** `asyncio.create_task(_record_audit_trail(...))`
    (`trust_controller.py:252`) and `asyncio.create_task(dispatch_notification(...))` (`:259`).
    Signals + composite are in scope here; the handler **returns `SuccessResponse` at `:272`**.
    **The tap goes here** — one more post-response dispatch beside the existing two; it runs after the
    `return`, so it cannot touch the response.
- **Path B (LATER) — `POST /api/v1/analyze`** — `backend/core/src/api/v1/analyze.py:37` (SDK/API-key,
  higher volume). Returns the SDK result directly; tapping it means working inside `sdk.analyze()`.
  Defer to after Path A is proven, same as the prior recon advised.

## C-2 — ⚠ Dedicated worker pool: **core is DB-less — reframe from "DB pool" to "HTTP pool"**

- **Confirmed: core has NO SQLAlchemy / DB pool.** `grep` for `create_engine|sessionmaker|pool_size|
  DATABASE_URL|psycopg|asyncpg` across `backend/core/src` returns nothing (only a *comment* in
  `sdk/client.py:20` noting latency is written to connectors' DB). `core/requirements.txt` has no DB
  driver. **Core persists everything by HTTP POST to connectors.**
- Therefore **locked decision #2 ("dedicated worker DB pool") does not apply literally in core** —
  there is no request-path DB pool for the worker to starve. The actual shared resource is the
  **singleton internal httpx pool** `core/src/core/http_pool.py:40` (`get_internal_client`, limits
  `max_connections=100, max_keepalive=50`, `pool` timeout `0.2s`, `http_pool.py:18-23`). The request
  path uses it for `_record_audit_trail`, latency, eval-count, and `dispatch_notification`; the
  shadow worker's audit write (`audit_bridge._post`, `audit_bridge.py:57-60`) uses the **same** pool.
- **Faithful core translation of the isolation intent:** give the shadow worker its **own dedicated
  httpx client/pool** (a small, separate `AsyncClient` with its own `max_connections`), distinct from
  `get_internal_client()`, so worker audit POSTs can never exhaust connections the request path needs.
  Same goal as decision #2 ("worker physically cannot starve request handling of connections"),
  applied to the resource core actually has. **Reviewer: please confirm this reframing** — it is the
  one substantive deviation forced by core's DB-less design.
- The Phase-2 in-process bound still applies on top: `runtime.py` `Semaphore`
  (`POLICY_MAX_CONCURRENT_EVALS=64`, `runtime.py:63,88-105,162-177`) sheds + counts before the worker
  ever reaches the pool, so the dedicated pool can be small.

## C-3 — Real `PillarResult` source + the reusable `from_pillar_results` adapter (the pivot's upside)

- Real `PillarResult`s are produced by `trust_service.evaluate_trust` and live at
  `trust_controller.py:188,244` **before** the tap — no recompute, no `route_inference()` at the tap.
- **Reuse the Phase-1 adapter as-is:** `SignalContext.from_pillar_results(pillar_results,
  composite_score=...)` (`policy/context.py:140-187`). This is the high-fidelity path connectors
  could not offer: it preserves the `evaluated=false` suppression nuance (`details["method"]==
  "demographic_fast_path"`, `status` PARTIAL/FAILED/SKIPPED, `details["fallback"]`) via
  `_interpret_result` (`context.py:190-`). **This is the concrete fidelity win of the pivot.**
- In dev these signals are deterministic (`VELDRIX_INFERENCE_MODE=stub`, `docker-compose.dev.yml:145`).

## C-4 — Phase-2 bound/timeout/shed primitives to reuse directly (in-process)

`policy/runtime.py::evaluate(...)` (`:120`) is the in-core host and is reused directly:
- Backpressure shed (not queue): `Semaphore` + `asyncio.wait_for(sema.acquire(), wait_ms)` →
  `BackpressureError`, `metrics.record_shed()` (`runtime.py:67,162-177`;
  `POLICY_BACKPRESSURE_WAIT_MS=50`, `:64`).
- Hard per-eval timeout budget: `asyncio.wait_for(signal_collector, budget_ms)`
  (`POLICY_EVAL_BUDGET_MS=250`, `runtime.py:62,181-201`) — slow eval severed + recorded degraded.
- Breaker awareness + fail-safe mode resolution + one `actuated:false` record (`runtime.py:209-256`).
- Metrics emitter: `telemetry/policy_metrics.py` (extend here for the impact-guard + worker-pool gauge).

## C-5 — Internal token name (confirm)

- The worker writes the shadow record to connectors via the existing `audit_bridge` → `http_pool`
  path, which attaches **`INTERNAL_SERVICE_TOKEN`** in **`X-Internal-Token`** (`http_pool.py:37`).
  This matches connectors' `require_internal_token` (`INTERNAL_SERVICE_TOKEN`). ✔ locked decision #3.
- Core's *inbound* key `VELDRIX_INTERNAL_API_KEY` / `X-Veldrix-Internal-Key` (`api/internal.py:22-26`,
  `config/__init__.py:22`) is a **different, unrelated** token (gates core's own `/internal` +
  `/api/v1/analyze`). The worker does **not** use it. (This is the same correction as Finding #4.)

## C-6 — Chain-write path the worker uses

- Unchanged from Finding #4: the worker emits via `policy/audit_bridge.py::emit_decision_record`
  (`:83-103`) → `_post` (`:53-80`) → `POST {CONNECTORS_URL}/api/audit-trails/internal/audit-trail`,
  which inserts THROUGH the hash chain (`_insert_with_chain`, `audit_controller.py:337`,
  `pg_advisory_xact_lock`) with `(request_id, action_type)` dedup. No audit-substrate change.
- The shadow record carries the markers via the engine's `to_audit_metadata` plus the integration
  overrides: real `mode`, forced `enforced:false`, carried `actuated:false`, `evaluated`, and the new
  `integration:shadow`. A distinct `action_type` (e.g. `policy_decision_shadow`) keeps the dedup key
  meaningful and lets operators filter real-traffic shadow records from synthetic/seed ones.

## C-7 — Request-time flag home (kill switch + %-gate + per-tenant mode)

- Core reads `os.getenv` at request time idiomatically (`http_pool.py:37`, `audit_bridge.py:30`,
  `config/__init__.py`), so request-time flags need no restart.
- **Kill switch** (proposed `ENGINE_SHADOW_ENABLED`, default off / **0%**) + **%-gate** (proposed
  `ENGINE_SHADOW_SAMPLE_PCT`, default 0), both read at dispatch, %-gate evaluated **before**
  scheduling so un-sampled requests allocate nothing.
- **Per-tenant mode** resolved via core's own `policy/mode_client.py::get_mode(tenant_id, policy_id)`
  (`:49`, async), default `shadow` fail-safe (`DEFAULT_ENFORCEMENT_MODE`, `:46,57`). Record the real
  resolved mode; force `enforced:false` regardless. Kill + % compose on top.

## C-8 — Dispatch primitive note

- Core's `/trust/evaluate` is an **`async def`** and its incumbent post-response idiom is
  `asyncio.create_task` (used 2× in this handler: `:252,259`; also `audit_bridge.py:100`). Locked
  decision #4 specifies FastAPI **`BackgroundTasks`** — also valid (runs after response on an async
  route). Both satisfy out-of-band; I will use `BackgroundTasks` per the locked decision, but the
  impact-guard benchmark must measure whichever mechanism ships. (Flagging only so the choice is
  explicit, not silently swapped.)

---

**Core-tap confirmation complete.** Two items for the reviewer before integration code:
**(⚠C-2) confirm the DB-pool→HTTP-pool reframing (core is DB-less; "dedicated worker pool" = a
dedicated httpx client),** and **(C-8) confirm `BackgroundTasks` over the incumbent `asyncio.create_task`.**
Everything else (tap point, real-signal reuse, Phase-2 primitives, token, chain-write, flags) is
confirmed and ready. **Awaiting review before any integration code.**
