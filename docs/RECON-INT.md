# RECON-INT.md — Phase 4 Reconnaissance (READ-ONLY)
## Engine Integration — Out-of-Band Shadow Connection to Real Traffic

**Status:** Phase 0 recon only. No integration code written. **STOP for review after this file.**
**Date:** 2026-06-19 · **Branch base:** `main` (48c371d)

> Purpose: map the production request path and identify the single safest out-of-band tap
> where the Policy Engine can observe real traffic **after** the response is finalized,
> consuming already-computed pillar signals, recording `enforced:false` decisions through
> the hash chain, and adding **zero** latency / **zero** failure modes to the request path.

---

## TL;DR — The recommendation

- **Integrate in the `core` service, not `connectors`.** The prompt biased toward "the
  connectors live surface where the audit substrate lives," but recon shows pillar
  **signals are produced only in `core`** (finding #3). Connectors stores the audit chain
  but computes no signals; tapping there would force us to ship signals cross-service or
  recompute — the latter is explicitly forbidden. The engine must run where the signals
  already exist: `core`.
- **First tap point: `POST /trust/evaluate`** in `backend/core/src/api/trust_controller.py`
  — specifically a new `asyncio.create_task(...)` dispatched **immediately after** the
  existing post-response fire-and-forget block at `trust_controller.py:251-256`, where
  `report.pillar_results` and `composite_trust_score` are already in scope. Lower volume
  (dashboard/JWT path), an explicit post-response hook already exists, minimal blast radius.
- **Second service (later PR, NOT this one): `POST /api/v1/analyze`** (SDK / API-key path,
  higher volume). Its signals live inside `sdk.analyze()`'s result and the route returns
  that result directly, so tapping it is more invasive — defer.
- **The out-of-band host already exists.** `backend/core/src/policy/runtime.py::evaluate()`
  is the Phase-2 Part-B host: bounded-concurrency backpressure, per-eval timeout budget,
  breaker awareness, fail-safe shadow mode resolution, emits exactly one `actuated:false`
  audit record. The integration is a thin fire-and-forget caller of this — we do **not**
  build a new worker/queue.

---

## Finding #1 — The exact production request path; the post-response point where signals exist

Two live request paths exist in `core`. Both **finalize the response first**, then fire
`asyncio.create_task(...)` side-effects — the existing fire-and-forget idiom we reuse.

### Path A (RECOMMENDED FIRST) — `POST /trust/evaluate`
`backend/core/src/api/trust_controller.py:146-281`
- `report = await trust_service.evaluate_trust(...)` — `trust_controller.py:188` — produces
  `report.pillar_results` (`{pillar_id: PillarResult}`), the exact input the engine consumes.
- `composite_trust_score = compute_composite_trust_score(report.pillar_results)` —
  `trust_controller.py:244` — the 0-1 composite the engine's `SignalContext` accepts.
- **Existing post-response fire-and-forget block:** `trust_controller.py:251-256`
  `asyncio.create_task(_record_audit_trail(... report ...))`. Signals + composite are in
  scope here and the function returns its `SuccessResponse` at `:272`. **This is the tap:**
  one additional `asyncio.create_task(_shadow_evaluate(...))` placed here cannot touch the
  response (the function has already built `response_data`; the task runs after `return`).
- Pre-existing fire-and-forget precedents in the same handler:
  `_record_latency` (`:194`), `_increment_eval_count` (`:195`), `dispatch_notification` (`:263`).

### Path B (LATER PR) — `POST /api/v1/analyze`
`backend/core/src/api/v1/analyze.py:49-117`
- Route returns `await sdk.analyze(...)` **directly** (`analyze.py:103`); no post-return hook
  in the route body. Signals (`result.pillars`) are assembled inside
  `backend/core/src/sdk/client.py::analyze()` (`client.py:434-462`), which already fires its
  own post-response telemetry via `asyncio.create_task(self._telemetry.record(...))`
  (`client.py:476-481`). Tapping here means inserting inside `sdk.analyze()` next to that
  telemetry dispatch — more invasive, higher volume. Defer to PR-2.

---

## Finding #2 — Existing async/background infrastructure to reuse (NO new queue)

We reuse the loop-native fire-and-forget primitive already used everywhere in `core`:

- `asyncio.create_task(...)` with a strong-reference set to avoid GC — the canonical pattern:
  - `trust_controller.py:194,195,252,263` (latency, eval-count, audit, notification)
  - `client.py:470-473,476-481` (latency + telemetry)
  - `policy/audit_bridge.py:100-103` (`_INFLIGHT` set keeps the audit POST alive)
  - `evaluation/background_worker.py:32-63` — `BackgroundEvaluationWorker.submit()` is a
    documented fire-and-forget task manager with an `_active_tasks` set (`:41,58-63`).
- **The engine's own out-of-band host already exists:** `policy/runtime.py::evaluate()`
  (`runtime.py:120-277`). It wraps the pure engine with backpressure (`runtime.py:162-177`),
  a hard per-eval timeout budget (`runtime.py:181-201`), breaker awareness
  (`runtime.py:209-217`), fail-safe mode resolution (`runtime.py:219-224`), and emits exactly
  one `actuated:false` audit record (`runtime.py:246-256`).

**Conclusion:** the integration is `asyncio.create_task(runtime.evaluate(...))` dispatched
after the response. No Celery/Redis/new worker is introduced.

---

## Finding #3 — Are pillar signals already computed in the live path? (YES — engine consumes them, adds no inference)

**Yes, fully.** The engine consumes existing `PillarResult` objects; it triggers no new
inference.

- The engine's only signal adapter is
  `SignalContext.from_pillar_results(pillar_results, composite_score=..., ...)` —
  `backend/core/src/policy/context.py:140-187`. It reads `result.status`, `result.score`,
  `result.details` off already-computed `PillarResult`s (`context.py:190-221`). No
  `route_inference()` call exists anywhere under `policy/`.
- In Path A those results exist at `trust_controller.py:188,244` **before** the tap.
- In Path B they exist at `client.py:434,448-462`.
- `route_inference()` is invoked **only** inside pillar implementations
  (`src/inference/router.py`, called from `src/pillars/implementations/ai_safety_pillars.py`),
  which run *during* `evaluate_trust`/`sdk.analyze` — i.e. before the response, before the tap.
  The shadow worker never calls them.
- **Connectors computes no pillar signals** (grep for `pillar|route_inference|SignalContext`
  in `backend/connectors/src` returns only report/metric display strings, never computation).
  This is why the tap must be in `core`.

**Constraint satisfied:** the worker is handed the already-computed `pillar_results` +
`composite_score`; its `signal_collector` simply yields them (no I/O, no LLM, no recompute).
Missing/degraded pillars are already encoded as `evaluated:false` by `context.py` —
fail-closed semantics in the record (nothing gates anyway).

---

## Finding #4 — The audit-write entry the worker calls (token-gated internal route, PR-1 hardened)

- Endpoint: `POST {CONNECTORS_URL}/api/audit-trails/internal/audit-trail` —
  `backend/connectors/src/modules/analytics/audit_controller.py:282-338`.
- **Token-gated (Part A/B, F-UNAUTH-1):** `Depends(require_internal_token)` (`:286`), which
  reads `INTERNAL_SERVICE_TOKEN` and fail-safe-disables (503) when unset
  (`core/middleware/internal_auth.py:21-34`).
- Core attaches the token automatically: `core/src/core/http_pool.py:28-45` injects
  `X-Internal-Token` on every internal call.
- **Hash chain + idempotency:** `_insert_with_chain()` (`audit_controller.py:223-268`) links
  each row into the per-tenant chain under a `pg_advisory_xact_lock`; the route dedups on
  `(request_id, action_type)` (`:314-323`) so a retried decision cannot double-write.
- The worker reaches this via the existing default sink
  `policy/audit_bridge.py::emit_decision_record` (`audit_bridge.py:83-103`), which posts
  `action_type="policy_decision"` (or `"policy_engine_error"`), `user_id=tenant_id`,
  `metadata=<full decision record>` (`audit_bridge.py:37-50`). **No change needed to the
  audit substrate.**

---

## Finding #5 — Recommended single tap point + which service FIRST (with reasoning)

**Tap point:** a new `asyncio.create_task(_shadow_evaluate(report.pillar_results,
composite_trust_score, user_id, request_id, ...))` inserted at
`backend/core/src/api/trust_controller.py:256` (immediately after the existing
`_record_audit_trail` dispatch), guarded by the kill switch + percentage gate read at
dispatch time. `_shadow_evaluate` calls `runtime.evaluate(...)`.

**First service: `core` `POST /trust/evaluate`.** Reasoning:
1. **Signals + composite already in scope post-response** at `:188,244` — zero recompute.
2. **An explicit post-response fire-and-forget block already exists** at `:251-256` — the tap
   slots in beside it; the response is already assembled (`:206-240`) and returned at `:272`.
3. **Lowest blast radius:** dashboard/JWT path, lower volume than the SDK path — the right
   place to prove the out-of-band promise before touching high-volume API traffic.
4. **The host is ready:** `runtime.evaluate()` already provides isolation/backpressure/budget.

**Second service (separate later PR):** `POST /api/v1/analyze` (SDK). Tapping it requires
working inside `sdk.analyze()` (`client.py:476`) and it is the high-volume surface — do it
only after Path A is proven on real traffic.

**Open design points for the build phase (flag here, decide at implementation):**
- **No production Policy loader exists.** `runtime.evaluate(policy=...)` requires a `Policy`,
  but there is **no policy store read-path in `core`** and `Policy` has no `from_dict`/
  `from_yaml` factory (`policy/schema.py` — only programmatic construction + `new_version`
  at `:291-315`). Migrations `009_policy_engine.sql` / `011_enforcement_mode_rollout.sql`
  define `policy_documents` in connectors but are **unapplied** and have no loader. The
  integration must supply a **bundled default shadow policy** constructed in code in `core`
  (single source, versioned + checksummed) to evaluate against. This is the largest missing
  piece and should be reviewed before build.
- **Force `enforced:false` structurally.** `runtime.evaluate` resolves the tenant's real mode
  and `engine._compute_enforced` (`engine.py:452-471`) returns `enforced=true` for
  block/escalate under `enforce`/`enforce_critical_only`. Per §2.2 this PR records the *real*
  `mode` for honesty but must force `enforced:false` on every record (observation only). Plan:
  pass the resolved mode through for the `mode` marker but override the emitted record's
  `enforced` to `false`, and add the `integration:shadow` marker — there is no worker→response
  path regardless.

---

## Finding #6 — Residual places an out-of-band failure could still back-pressure the request path

The dispatch runs on the **same event loop** as the request path, so resource sharing is the
real risk surface. Identified residual paths and their existing mitigations:

1. **Shared internal HTTP pool.** The worker's audit-write reuses the singleton pool
   (`http_pool.py:40-45`, 100 conns / 50 keepalive) that the request path also uses for
   `_record_latency` / `_increment_eval_count` / `_record_audit_trail`. Under worker overload,
   audit POSTs could consume pool connections needed by request-path internal calls.
   *Mitigation:* the runtime semaphore bounds in-flight evals to `POLICY_MAX_CONCURRENT_EVALS`
   (=64, `runtime.py:63,162-177`) and sheds beyond it; pool timeouts are tight
   (`http_pool.py:23`). **Build-phase note:** consider a dedicated, smaller pool or an explicit
   per-worker connection cap so engine load can never starve request-path internal calls.
2. **Unbounded task spawn.** `asyncio.create_task` per request has no spawn ceiling at the
   dispatch site; tasks pile up only as far as the runtime semaphore allows (each waits
   ≤ `POLICY_BACKPRESSURE_WAIT_MS`=50ms then raises `BackpressureError`, `runtime.py:158,166-175`).
   *Mitigation:* shed-and-count is already implemented (`metrics.record_shed`, `runtime.py:168`).
   **Build-phase note:** the percentage gate must be evaluated **before** `create_task` so
   un-sampled requests never even allocate a task.
3. **Shared default thread pool / CPU.** The pure engine is sub-ms CPU
   (`runtime.py:226-231`); signal collection in shadow is a no-op (signals pre-computed,
   finding #3), so there is no blocking call that would occupy the loop. No `run_in_executor`
   is involved. Low risk.
4. **GC / reference leaks.** Fire-and-forget tasks must be strong-referenced
   (`_INFLIGHT`/`_active_tasks` pattern, `audit_bridge.py:106-107`, `background_worker.py:41`)
   to avoid mid-flight GC; the new dispatch must follow the same pattern.

**No path back-pressures the request path by construction:** the tap is after `return`
(`trust_controller.py:272`), the host sheds rather than queues, and per-eval work is bounded
by the timeout budget (`POLICY_EVAL_BUDGET_MS`=250, `runtime.py:62`).

---

## What this phase will add (preview — NOT built yet)

For the reviewer's context, the build phase will need to add (in `core`, reusing existing infra):
- A bundled default **shadow policy** + a thin `_shadow_evaluate()` dispatcher calling
  `runtime.evaluate()`, wired at `trust_controller.py:256`.
- **Kill switch** (`ENGINE_SHADOW_ENABLED`, default OFF) + **percentage gate**
  (`ENGINE_SHADOW_SAMPLE_PCT`, default 0) + per-tenant honoring (existing `mode_client`),
  all read at dispatch time (no deploy to change).
- Record markers: real `mode`, forced `enforced:false`, carried `actuated:false`, new
  `integration:shadow`.
- New metrics (extend `telemetry/policy_metrics.py`): **request-path dispatch-impact guard**
  (~0 hand-off latency), dropped-eval/un-sampled counters, worker exception count,
  sampled-percentage gauge; plus a "shadow on real traffic" Grafana panel.
- `INTEGRATION_RUNBOOK.md`.

None of the above is implemented in this commit. **Awaiting review of the tap-point decision
before any integration code.**
