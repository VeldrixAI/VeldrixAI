# INTEGRATION_RUNBOOK.md — Phase 6 Engine Shadow Integration (dev)

**Scope:** the out-of-band, shadow-only connection of the Policy Engine to the **core**
`POST /trust/evaluate` request path, **in dev only** (local Compose). Built per
`docs/12b-engine-integration-dev-core-first.md` and `docs/RECON-INT.md`.

**The one rule:** the request path never waits on, depends on, or can be failed by the
engine. The engine runs *after* the response is sent (FastAPI `BackgroundTasks`), records
what it *would* decide (`enforced:false`, `integration:shadow`), and can change nothing
about any response. This runbook is how you operate, observe, and trust that.

---

## 1. What is wired (one-paragraph mental model)

`evaluate_trust` finishes building its `SuccessResponse`, then calls
`dispatch_shadow_eval(...)` (`src/policy/shadow_integration.py`). That function — on the
request path — does only a **request-time kill-switch + sample-gate check** and a single
`BackgroundTasks.add_task`. Everything else runs **after the response is sent**: the
worker hands the already-computed `PillarResult`s to `runtime.evaluate` (reusing the
Phase-1 `from_pillar_results` adapter and the Phase-2 backpressure/timeout/shed
primitives), resolves the tenant's real mode via a **dedicated HTTP pool**
(`src/policy/shadow_pool.py`, never the shared request pool), forces the record
`enforced:false` / `actuated:false` / `integration:shadow`, and writes it through the
connectors hash chain as `action_type=policy_decision_shadow`.

---

## 2. Turn it ON / OFF (runtime flags — genuinely no restart)

> **Closeout correction (honesty note):** this section previously claimed env vars gave
> instant no-restart control. That was wrong twice over — env values are frozen at
> container creation (so a flip required a recreate = restart), and the suggested
> `exec sh -c 'export …'` only set variables in the exec'd shell, never in the server
> process. The controls are now **runtime flags in core's Redis**, read per-request
> through a short local cache (`src/policy/shadow_flags.py`). Flipping them requires
> **no restart, no recreate, no deploy** — proven live with the same PID before/after
> (`backend/core/scripts/shadow_hot_detach_live.py`).

**The control (authenticated internal endpoint):**
```bash
# Attach at a small sample (recommended first step):
curl -X POST http://localhost:8001/internal/shadow-flags \
  -H "X-Veldrix-Internal-Key: $VELDRIX_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "sample_pct": 5}'

# Read the effective posture (also reports source: redis | env | failsafe):
curl http://localhost:8001/internal/shadow-flags -H "X-Veldrix-Internal-Key: $KEY"

# Clear the runtime flags (env defaults rule again):
curl -X DELETE http://localhost:8001/internal/shadow-flags -H "X-Veldrix-Internal-Key: $KEY"
```

**Ops fallback (no endpoint needed):**
```bash
docker compose -f docker-compose.dev.yml exec redis \
  redis-cli -n 1 MSET veldrix:shadow:engine_enabled 1 veldrix:shadow:sample_pct 5
```
(Core's dev `REDIS_URL` is `redis://redis:6379/1` — note the `-n 1`.)

**Semantics:**
- Redis key present → it is authoritative. Key absent → the env default
  (`ENGINE_SHADOW_ENABLED` / `ENGINE_SHADOW_SAMPLE_PCT`) applies as the static baseline.
- **Max propagation delay:** flag-cache TTL + one Redis read = **2.5 s at defaults**
  (`ENGINE_SHADOW_FLAG_CACHE_TTL_S=2` + `ENGINE_SHADOW_FLAG_REDIS_TIMEOUT_S=0.5`).
  The process that performs the flip via the endpoint converges instantly. Measured
  live: halt 0.36 s, re-attach 0.08 s.
- **Fail-safe:** if Redis is unreachable at flag-read time, the engine is forced
  **DETACHED** (never attached) regardless of env or last-known state, visible as
  `source:"failsafe"` and counted as `outcome="skipped_failsafe"`. Recovery is
  automatic once Redis returns. A flag-store outage can never silently leave the
  engine attached.
- First-run posture is unchanged: nothing set anywhere = **OFF / 0%**. Attachment is an
  explicit act.

**Ramp:** raise `sample_pct` step-wise (5 → 25 → 50 → 100) via the endpoint, watching
the IMPACT GUARD (§4) at each step. In dev you can go straight to 100% to load-test.

---

## 3. INSTANT DETACH (the emergency stop — no restart, mid-stream)

```bash
curl -X POST http://localhost:8001/internal/shadow-flags \
  -H "X-Veldrix-Internal-Key: $VELDRIX_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" -d '{"enabled": false}'
```

What happens (all proven live — see `PHASE6_CLOSED.md` evidence):
- **New dispatch halts** on every worker within the propagation bound (≤2.5 s default;
  0.36 s measured). `skipped_kill_switch` becomes the only incrementing outcome.
- **In-flight evaluations drain cleanly**: they complete harmlessly (they are
  out-of-band and structurally `enforced:false` — completing touches nothing) and the
  dedicated-pool in-flight gauge returns to 0. No worker exceptions, no torn records.
- **The request path never notices** — there is no response-path code to roll back;
  detaching stops scheduling the after-response worker, nothing else.
- **Flip back on** re-attaches the same way, same process, no restart.

If Redis itself is the emergency (store down): the engine is already fail-safe
detached everywhere — that is the designed posture, not an action you need to take.

---

## 4. What to watch — Grafana "Shadow on Dev Traffic"

Dashboard: `observability/grafana/dashboards/policy-shadow-on-dev-traffic.json`
(auto-provisioned; Prometheus already scrapes `veldrix-core:8001/metrics`).

| Panel | Metric | Read it as |
|---|---|---|
| **IMPACT GUARD** (top, widest) | `veldrix_policy_shadow_dispatch_handoff_seconds` p50/p95/p99 | **The one that matters most.** The latency the dispatch adds to the *request path*. Must sit in the sub-millisecond buckets. A rise = the out-of-band promise is breaking → **stop ramping, investigate.** |
| Sample % in effect | `veldrix_policy_shadow_sample_pct` | The live ramp level. |
| What the engine WOULD decide | `veldrix_policy_decisions_total` by `action` | The shadow-on-traffic artifact — the decision distribution on real dev requests. |
| Shadow dispatch outcomes | `veldrix_policy_shadow_outcome_total` by `outcome` | Full accounting; no dropped work is invisible. |
| Worker pool in-flight | `veldrix_policy_shadow_worker_pool_inflight` (+ `…_inflight_peak`) | Dedicated-pool saturation. Pinning at the ceiling means writes shed (`write_failed`) — that is the **isolation working**, not a request-path problem. The `peak` series is the process high-water mark: saturation bursts are sub-second and slip between 15s scrapes. |
| Worker eval latency | `veldrix_policy_shadow_worker_latency_seconds` | Off-request-path; informational. |
| Dropped / failed / exception | `veldrix_policy_shadow_outcome_total{outcome=...}` | The fault counters. |

**Outcome vocabulary** (`outcome` label): `dispatched`, `skipped_kill_switch`,
`skipped_unsampled`, `skipped_failsafe` (flag store unreachable → forced detach),
`dropped_backpressure`, `dropped_dispatch`, `worker_exception`, `written`,
`write_failed`, `pool_recycled` (dedicated-pool wedge self-heal fired — see §5 note).

### What each alert-worthy signal means
- **IMPACT GUARD p99 climbs above ~1ms:** the request-path hand-off is no longer free.
  Detach (§3) and investigate before doing anything else. This is the only signal that
  can indicate the integration is touching the request path.
- **`worker_exception` rising:** the engine/worker is faulting *after the response*. The
  request path is unaffected, but the decision data is degraded — inspect logs
  (`veldrix.policy.shadow`). Not a request-path emergency.
- **`write_failed` / pool in-flight pinned:** the dedicated pool is saturated or
  connectors is unhealthy. Shadow records are being shed (counted). Request path
  unaffected. Lower the sample %, or check connectors.
- **`dropped_backpressure` rising:** the runtime concurrency gate is shedding under load.
  Expected under heavy load; the request path is unaffected. Raise
  `POLICY_MAX_CONCURRENT_EVALS` only if you want more shadow coverage.

---

## 5. Tunables (env, all optional — safe defaults)

| Variable | Default | Purpose |
|---|---|---|
| `ENGINE_SHADOW_ENABLED` | `false` | Kill-switch **env default** — the baseline when the Redis key is absent (§2). |
| `ENGINE_SHADOW_SAMPLE_PCT` | `0` | Sample-rate **env default** — baseline when the Redis key is absent (§2). |
| `ENGINE_SHADOW_FLAG_CACHE_TTL_S` | `2` | Runtime-flag local cache TTL; bounds flip propagation (§2). |
| `ENGINE_SHADOW_FLAG_REDIS_TIMEOUT_S` | `0.5` | Flag-store read/write timeout; a slow store degrades to fail-safe, never blocks. |
| `ENGINE_SHADOW_POOL_MAX_CONNECTIONS` | `5` | Dedicated worker pool ceiling (isolation bound). |
| `ENGINE_SHADOW_POOL_ACQUIRE_TIMEOUT_S` | `0.25` | Pool acquire timeout → fast shed when saturated. |
| `ENGINE_SHADOW_POOL_RECYCLE_AFTER_TIMEOUTS` | `10` | Wedge self-heal: consecutive PoolTimeouts at/below the cap (zero successes) before the client is recycled. Live finding: a host clock jump (WSL2 suspend/resume) wedged the httpx pool permanently; genuine saturation never matches this signature because in-flight sits above the cap. |
| `ENGINE_SHADOW_MODE_CACHE_TTL_S` | `5` | Per-tenant mode cache TTL (bounds connectors reads; load-independent). |
| `POLICY_EVAL_BUDGET_MS` | `250` | Per-eval signal-collection budget (Phase-2). |
| `POLICY_MAX_CONCURRENT_EVALS` | `64` | Runtime backpressure gate (Phase-2). |
| `INTERNAL_SERVICE_TOKEN` | — | Token the dedicated pool attaches (`X-Internal-Token`) for the connectors audit write. Same token the request path uses; unset → connectors fails closed (503/401). |

> Note: the audit-write token is **`INTERNAL_SERVICE_TOKEN`** (core→connectors), *not*
> `VELDRIX_INTERNAL_API_KEY` (core's own inbound API key). See `RECON-INT.md` Finding #4 / C-5.

---

## 6. Verifying it's behaving (quick checks)

```bash
# Tests (the proof package): isolation, zero-actuation, controls, integrated-system,
# faults, hot-detach runtime flags, pool wedge self-heal
cd backend/core && python -m pytest \
  tests/test_shadow_integration.py \
  tests/integration/test_shadow_integrated_system.py \
  tests/test_shadow_tap_wiring.py \
  tests/test_shadow_flags.py \
  tests/test_shadow_pool_selfheal.py -q

# Live drivers (dev stack up; JWT minted from core's JWT_SECRET_KEY):
python backend/core/scripts/shadow_shed_load.py --jwt-secret "$JWT" --internal-key "$KEY"
PYTHONPATH=backend/core/scripts \
  python backend/core/scripts/shadow_hot_detach_live.py --jwt-secret "$JWT" --internal-key "$KEY"

# Live: confirm shadow records are landing in the chain (connectors), distinguishable by action_type
#   action_type = "policy_decision_shadow"  (and "policy_engine_error_shadow" for engine faults)
# Live: confirm the impact guard is ~0 and the worker pool isn't starving anything
curl -s http://localhost:8001/metrics | grep -E 'veldrix_policy_shadow_(dispatch_handoff|worker_pool_inflight|outcome)'
```

---

## 7. "Ready to promote to prod" criteria (exit checklist for this dev phase)

Promote the core integration to the prod CI/CD phase only when, in dev:
1. **IMPACT GUARD p99 stays sub-millisecond** through a 0→100% ramp under sustained load.
2. **The full fault-injection matrix is green** (throw / hang-past-budget / pool-exhaust /
   kill-mid-stream / malformed signals): every fault is contained + counted, request path
   unaffected each time (`tests/integration/test_shadow_integrated_system.py`).
3. **Zero actuation proven**: every shadow record is `enforced:false` / `actuated:false` /
   `integration:shadow`, including decided `block`/`escalate`; response bytes are identical
   with the engine attached vs detached (`tests/test_shadow_tap_wiring.py`).
4. **Dedicated-pool isolation proven LIVE**: real concurrency saturates the cap-5 pool;
   overflow sheds + counts; impact guard flat throughout; shared request-path pool never
   touched; in-flight returns to 0 (no leak).
5. **No PII in telemetry** under concurrent scrape.
6. **Instant detach verified LIVE as a runtime act** (mid-stream flip → new dispatch halts
   within the propagation bound AND in-flight drains cleanly, same process, no restart;
   flip-back re-attaches; flag-store outage fails to detached).

**All six criteria are live-proven as of 2026-07-15 — see `PHASE6_CLOSED.md` for the
criterion-by-criterion evidence pointers. Phase 6 is CLOSED**; the proof package
justifies promoting the *same mechanism* to prod through CI/CD (a separate phase),
starting again at 0% there.

---

## 8. Connectors integration is a SEPARATE, LATER phase

This phase is **core only**. Connectors-first was reconnoitered and rejected (RECON-INT.md
Finding #3 / C-2): connectors is a separate image that **cannot import `policy/`** and
holds only a lossy, flattened projection of the signals. To shadow-integrate connectors
later you must first **vendor this proven engine into the connectors image** — extract
`src/policy/` (engine, context, schema, evaluator, resolution, runtime, the shadow
modules) into a read-only shared package both images install, *without modifying the
decision logic*, then repeat this exact out-of-band/shadow/dedicated-pool pattern against
a connectors request surface (the internal audit-trail write). That work is explicitly out
of scope here; do not attempt it as part of the core integration.
