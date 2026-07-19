# RECON-CLOSE — Phase 6 Closeout Reconnaissance (READ-ONLY)

Scope: the two remaining promote-to-prod gaps — (1) the kill switch is env-only
("detach via restart", not hot-detach) and (2) the shed path is harness-proven only.
This document pins the exact code points the closeout PR will touch, before touching
anything. All references are `file:line` against `phase6-engine-integration-dev` @ `b3a4323`.

---

## Finding 1 — How the kill switch / gate is read today (the env-read call sites to replace)

The gate **is already read per-request at dispatch time** — the architecture is right.
The problem is purely the **backing store**: `os.getenv()` reads the process
environment, which is frozen at container creation, so changing the value requires a
container recreate (= restart). That is what makes today's "instant detach" actually
"detach via restart."

| What | Where | Read |
|---|---|---|
| Kill switch | `backend/core/src/policy/shadow_integration.py:77-79` — `shadow_enabled()` | `_truthy(os.getenv("ENGINE_SHADOW_ENABLED"))` |
| Sample gate | `backend/core/src/policy/shadow_integration.py:82-88` — `sample_pct()` | `float(os.getenv("ENGINE_SHADOW_SAMPLE_PCT", "0"))` |
| Call sites (per-request) | `shadow_integration.py:118` (`if not shadow_enabled()`) and `:122` (`pct = sample_pct()`), inside `dispatch_shadow_eval()` | wrapped by the impact-guard timer (`t0` at `:116`, `observe_shadow_handoff` at `:147`) |

These two functions are the **entire** surface to convert. Both are same-mechanism, so
per the prompt's "if cheap and same-mechanism" clause, **both** the kill switch and the
%-gate should move to the runtime flag in one stroke.

Bonus precedent in the same module: `_mode_cache` + `_MODE_CACHE_TTL_S` (default 5 s) at
`shadow_integration.py:61-64` and `:257-292` is an existing short-TTL local-cache
pattern — the flag reader's 1–5 s local cache follows the same shape (max propagation
delay = cache TTL).

## Finding 2 — Core already has Redis; reuse it (no new store)

**Confirmed — core has the dependency, the config, and a live Redis in the dev stack:**

- Dependency: `backend/core/requirements.txt:28` — `redis[hiredis]>=5.0.0` (async client
  via `redis.asyncio`; explicitly **not** deprecated aioredis). Test emulation:
  `fakeredis>=2.23.0` at `requirements.txt:47`.
- Config: `backend/core/src/config.py:19` — `REDIS_URL` (default `redis://localhost:6379/0`).
- Working usage pattern: `backend/core/src/inference/circuit_breaker_redis.py:179-192` —
  `redis.asyncio.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2.0,
  socket_timeout=2.0)`, lazily initialised.
- Dev stack: `docker-compose.dev.yml:51-64` (redis:7-alpine service) and `:140-141` —
  core gets `REDIS_URL=redis://redis:6379/1` and `CIRCUIT_BREAKER_BACKEND=redis`.
- Key-namespace precedent: `veldrix:cb:*` (`circuit_breaker_redis.py:12-16, :41`) →
  the flag keys `veldrix:shadow:engine_enabled` / `veldrix:shadow:sample_pct` follow suit.

**One honest nuance:** the circuit breaker's Redis client is private to the
`RedisCircuitBreaker` instance (`circuit_breaker_redis.py:150`, `:179`) and only exists
when `CIRCUIT_BREAKER_BACKEND=redis`. Reaching into that singleton would couple the
shadow gate to the breaker's lifecycle/fallback state. Plan: the flag reader opens its
own lightweight `redis.asyncio` client from the **same package, same `REDIS_URL`, same
server** — same store, zero new dependency, no second store. (The constraint is "no new
store/dependency", which this satisfies; it is not "share the breaker's connection object".)

**Fail-safe direction is opposite the breaker's:** the breaker fails *available*
(degrades to in-process, keeps serving). The flag must fail **detached** (engine off).
The flag reader therefore cannot reuse the breaker's fallback logic — on any Redis
error/timeout it returns `enabled=False`, and counts the activation (Finding 5).

## Finding 3 — The dispatch decision point (where the runtime flag must be checked)

- Live tap: `backend/core/src/api/trust_controller.py:265-271` — the handler calls
  `dispatch_shadow_eval(background_tasks, ...)` after response assembly.
- Decision point: `backend/core/src/policy/shadow_integration.py:116-147` —
  `dispatch_shadow_eval()` runs the gate (`:118` kill switch, `:122-124` sample) and, if
  attached+sampled, does one `background_tasks.add_task(...)` (`:131`). This is ON the
  request path and measured by the impact guard, so the runtime-flag read here must be
  the cached local read (Redis hit at most once per TTL, never per request), and any
  Redis await must not block dispatch — the read path must stay sync-fast/cached at this
  call site.
- In-flight drain point (for hot-detach's second half): workers are
  `_shadow_evaluate()` coroutines (`shadow_integration.py:167-208`) already fully
  isolated + `enforced:false`-forced by `_mark_only_sink` (`:152-164`) — an in-flight
  eval completing after a flip-off is harmless by construction (out-of-band, zero
  actuation). "Drain cleanly" = let in-flight finish (or sever at the worker boundary);
  the proof must show both new-dispatch-halt and in-flight-drain without touching a request.

## Finding 4 — The worker pool cap + shed logic (what the live test must saturate)

There are **two** shed layers; the closeout target is the dedicated pool (cap 5):

**(a) Dedicated worker HTTP pool — cap 5 (the live-proof target):**
- Cap: `backend/core/src/policy/shadow_pool.py:39` —
  `_MAX_CONNECTIONS = int(os.getenv("ENGINE_SHADOW_POOL_MAX_CONNECTIONS", "5"))`.
- Fast-shed mechanism: pool-acquire timeout 0.25 s at `shadow_pool.py:46`
  (`ENGINE_SHADOW_POOL_ACQUIRE_TIMEOUT_S`) — a saturated pool raises `httpx.PoolTimeout`
  instead of queueing.
- Where the shed lands + is counted: the `PoolTimeout` surfaces inside
  `_write_shadow_record` (`shadow_integration.py:239-243` → outcome **`write_failed`**)
  or `_resolve_mode` (`:285-289` → fail-safe `shadow` mode). So at this layer the
  shed count is `veldrix_policy_shadow_outcome_total{outcome="write_failed"}`.
- Saturation gauge: `track_in_flight()` (`shadow_pool.py:90-100`) increments **before**
  connection acquisition, so the in-flight gauge can legitimately read >5 while overflow
  requests wait out the 0.25 s acquire window — gauge pinned at/above 5 is the
  saturation signal.

**(b) Runtime concurrency gate — cap 64 (secondary):**
- `backend/core/src/policy/runtime.py:63` — `POLICY_MAX_CONCURRENT_EVALS` default 64;
  semaphore acquire with 50 ms wait (`runtime.py:162-175`) → `BackpressureError` →
  `metrics.record_shed()` (**`veldrix_policy_shed_total`**). Caught by the worker at
  `shadow_integration.py:199-201` → outcome **`dropped_backpressure`**.

**Implication for the load driver (honest):** at dev defaults, real concurrency >5
in-flight worker I/O saturates layer (a) long before layer (b)'s 64. The "shed-count
metric" for the cap-5 pool is the `write_failed` outcome counter, not
`veldrix_policy_shed_total` (which belongs to the 64-eval gate). The live proof should
saturate (a) as primary evidence, and may optionally lower `POLICY_MAX_CONCURRENT_EVALS`
to also demonstrate (b) live — but must not mock either cap. Workers are FastAPI
`BackgroundTasks` (post-response, on the event loop), so >5 governed requests issued in
a tight window at 100% sampling produce genuinely overlapping worker I/O.

## Finding 5 — Exact metric names for the live evidence panels

All defined in `backend/core/src/telemetry/policy_metrics.py`:

| Role | Metric | Where |
|---|---|---|
| **Impact guard** (request-path cost of dispatch) | `veldrix_policy_shadow_dispatch_handoff_seconds` (Histogram) | `policy_metrics.py:143-147` |
| **Pool saturation** (dedicated pool in-flight) | `veldrix_policy_shadow_worker_pool_inflight` (Gauge) | `policy_metrics.py:159-161` |
| **Shed / outcome accounting** | `veldrix_policy_shadow_outcome_total{outcome=…}` (Counter) | `policy_metrics.py:152-155` |
| **Runtime-gate shed** (64-cap layer) | `veldrix_policy_shed_total` (Counter) | `policy_metrics.py:129-131` |
| Sample % in effect | `veldrix_policy_shadow_sample_pct` (Gauge) | `policy_metrics.py:165-167` |
| Worker wall-clock (off-path) | `veldrix_policy_shadow_worker_latency_seconds` (Histogram) | `policy_metrics.py:172-174` |

Outcome labels currently emitted (grep of `record_shadow_outcome` call sites in
`shadow_integration.py`): `dispatched`, `skipped_kill_switch`, `skipped_unsampled`,
`dropped_dispatch`, `dropped_backpressure`, `worker_exception`, `write_failed`, `written`.

**Gap (new, required by Fix 1):** no metric exists for **fail-safe activation**
(flag store unreachable → forced detach). Plan: a new outcome label on the existing
counter (e.g. `skipped_failsafe`) — zero new metric families.

---

## Supporting recon — the flip mechanism's auth host

- Core already has an **authenticated internal router**: `backend/core/src/api/internal.py`
  (`/internal/*`, `_require_internal_key` at `:25-47`, header `X-Veldrix-Internal-Key`
  or `Authorization: Bearer`, keyed by `VELDRIX_INTERNAL_API_KEY`). This is the natural
  host for the flip endpoint.
- Note: `INTERNAL_SERVICE_TOKEN` / `X-Internal-Token` (suggested in the brief) is core's
  **outgoing** credential to connectors (`http_pool.py:37`, `shadow_pool.py:64`); core's
  **incoming** internal-auth pattern is `internal.py`'s key gate. The flip control will
  reuse the incoming pattern (plus the documented `redis-cli SET veldrix:shadow:engine_enabled …`
  ops fallback).
- The "five Redis tests" (memory/prior PR): `backend/core/tests/test_circuit_breaker_redis.py`
  — exactly 5 tests use the real-Redis `clean_redis` fixture (`:77, :112, :150, :215, :248`);
  the file also has an unreachable-fallback test (`:183`) and a memory-backend test (`:264`).
  These must stay green, and the unreachable-fallback test is the template for the
  flag's fail-safe-to-detached test (with the opposite safe posture).

## What Fix 1 will and will not touch (pinned by this recon)

- **Touch:** `shadow_integration.py:77-88` (flag reads → Redis-backed cached reads),
  a new small flag-store module beside `shadow_pool.py`, a flip endpoint in
  `internal.py`'s pattern, one new outcome label, tests, runbook.
- **Not touch:** engine decision logic, pillar scoring, `route_inference()`,
  `_mark_only_sink`'s forced `enforced:false`/`actuated:false` (`shadow_integration.py:162-164`),
  the worker→response non-path (structurally absent), connectors, prod. Default posture
  unchanged: absent flag keys = OFF / 0 %.
