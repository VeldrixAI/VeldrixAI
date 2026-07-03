# VeldrixAI — Phase 6 Shadow Integration (Engine on Live Traffic)

> **Page status:** Current — dev only · **Last updated:** 2026-07-03 · **Audience:** Engineering, on-call
> **Source of truth:** `backend/core/src/policy/shadow_integration.py`, `shadow_pool.py` · operator runbook in `INTEGRATION_RUNBOOK.md`

## The one rule

**The request path never waits on, depends on, or can be failed by the Policy Engine.** The engine runs *after* the response is sent (FastAPI `BackgroundTasks`), records what it *would* decide (`enforced:false`, `actuated:false`, `integration:shadow`), and can change nothing about any response.

## Scope & history

- Connects the proven Policy Engine to the live **core** `POST /trust/evaluate` path, **in dev only**, shadow-only.
- **Design pivot (locked):** the original mandate was connectors-first; reconnaissance (`docs/RECON-INT.md`) proved connectors is a separate image that cannot import `backend/core/src/policy/` and holds only a lossy signal projection. Approved pivot → **core-first**. Connectors integration is a **separate later phase** that requires vendoring the engine into the connectors image first — it is explicitly not "PR 2".

## Mechanism

1. `evaluate_trust` finishes building its response, then calls `dispatch_shadow_eval(...)`.
2. On the request path, only two things happen: a request-time **kill-switch + sample-gate check**, and one `BackgroundTasks.add_task`. Sub-millisecond.
3. After the response is sent, the worker hands the **already-computed** `PillarResult`s to `runtime.evaluate` (reusing the Phase 1 `from_pillar_results` adapter and Phase 2 backpressure/timeout/shed primitives — **no recompute, no extra inference calls**).
4. Tenant mode is resolved via a **dedicated HTTP pool** (`shadow_pool.py`) — never the shared request-path pool. (Core is DB-less; the shared resource to protect is the HTTP pool.)
5. The record is forced `enforced:false / actuated:false / integration:shadow` and written through the connectors hash chain as `action_type=policy_decision_shadow` (engine faults: `policy_engine_error_shadow`), authenticated with `INTERNAL_SERVICE_TOKEN`.

## Controls (read at request time — no restart needed)

| Variable | Default | Meaning |
|---|---|---|
| `ENGINE_SHADOW_ENABLED` | `false` | Global kill switch, above per-tenant mode. `false` detaches the engine from all traffic. |
| `ENGINE_SHADOW_SAMPLE_PCT` | `0` | Traffic sample 0–100, checked **before** any task allocation. |

First-run posture is deliberately **OFF at 0%** — attachment is an explicit act. Ramp step-wise (5 → 25 → 50 → 100) watching the impact guard. **Instant detach:** set `ENGINE_SHADOW_ENABLED=false`; the very next request is detached.

## What to watch — Grafana "Shadow on Dev Traffic"

| Panel | Metric | Read it as |
|---|---|---|
| **IMPACT GUARD** | `veldrix_policy_shadow_dispatch_handoff_seconds` p50/95/99 | **The one that matters.** Latency the dispatch adds to the request path — must stay sub-millisecond. A rise means the out-of-band promise is breaking: stop ramping, detach, investigate. |
| Sample % in effect | `veldrix_policy_shadow_sample_pct` | Live ramp level |
| What the engine WOULD decide | `veldrix_policy_decisions_total{action}` | Decision distribution on real traffic |
| Dispatch outcomes | `veldrix_policy_shadow_outcome_total{outcome}` | Full accounting — no dropped work is invisible |
| Worker pool in-flight | `veldrix_policy_shadow_worker_pool_inflight` | Pinned at ceiling ⇒ writes shed — that is **isolation working**, not a request-path problem |
| Worker eval latency | `veldrix_policy_shadow_worker_latency_seconds` | Off-request-path; informational |

Outcome vocabulary: `dispatched`, `skipped_kill_switch`, `skipped_unsampled`, `dropped_backpressure`, `dropped_dispatch`, `worker_exception`, `written`, `write_failed`.

**Triage:** impact-guard p99 > ~1 ms → detach and investigate (the only signal that can implicate the request path). `worker_exception` rising → decision data degraded, request path unaffected, check `veldrix.policy.shadow` logs. `write_failed`/pool pinned → connectors unhealthy or pool saturated; lower sample %.

## Additional tunables

| Variable | Default | Purpose |
|---|---|---|
| `ENGINE_SHADOW_POOL_MAX_CONNECTIONS` | 5 | Dedicated worker pool ceiling (isolation bound) |
| `ENGINE_SHADOW_POOL_ACQUIRE_TIMEOUT_S` | 0.25 | Fast shed when saturated |
| `ENGINE_SHADOW_MODE_CACHE_TTL_S` | 5 | Per-tenant mode cache TTL |
| `POLICY_EVAL_BUDGET_MS` / `POLICY_MAX_CONCURRENT_EVALS` | 250 / 64 | Phase 2 runtime primitives, reused |
| `INTERNAL_SERVICE_TOKEN` | — | Audit-write token (core→connectors). **Not** `VELDRIX_INTERNAL_API_KEY`. |

## Proof package (tests)

```
backend/core/tests/test_shadow_integration.py                     # isolation, zero-actuation, controls
backend/core/tests/integration/test_shadow_integrated_system.py   # mode-race, concurrent scrape, back-pressure, fault matrix
backend/core/tests/test_shadow_tap_wiring.py                      # response bytes identical attached vs detached
```

## Promotion criteria (dev → prod phase)

1. Impact guard p99 sub-millisecond through a 0→100% ramp under sustained load
2. Full fault-injection matrix green (throw / hang / pool-exhaust / kill mid-stream / malformed signals) — every fault contained + counted, request path unaffected
3. Zero actuation proven — every record `enforced:false / actuated:false / integration:shadow`, response bytes identical attached vs detached
4. Dedicated-pool isolation proven (overload sheds + counts, shared pool untouched, no leak)
5. No PII in telemetry under concurrent scrape
6. Instant detach verified

When all six hold, the same mechanism promotes to prod through CI/CD (separate phase), starting again at 0%.
