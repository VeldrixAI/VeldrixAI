# PHASE6_CLOSED.md — Engine Integration (dev): the honest final scorecard

**Status: CLOSED — 2026-07-15.** Every promote-to-prod criterion below is marked proven
only with **live evidence** (a metric captured from the running dev stack, a Grafana
render, or a live-driver run against real traffic). "0 failures" alone closed nothing;
where a live run contradicted the harness, the finding is documented here, fixed, and
re-proven. Unlocks: CI/CD prod promotion phase + connectors engine-vendoring phase.

Evidence directory: `docs/evidence/phase6-closeout/` (Grafana renders, dashboard
`VeldrixAI Policy Engine — Shadow on Dev Traffic (Phase 6)`, uid `ffs4g8go83474b`).
Live drivers: `backend/core/scripts/shadow_shed_load.py`,
`backend/core/scripts/shadow_hot_detach_live.py`. All numbers below are from the final
evidence session (2026-07-15 17:36–17:49 UTC, final code, one core process).

---

## The scorecard — every promote-to-prod criterion, with its live evidence

| # | Criterion (runbook §7) | Verdict | Live evidence |
|---|---|---|---|
| 1 | **Impact guard p99 sub-millisecond through ramp + load** | **PROVEN LIVE** | 0→100% ramp clean (2026-07-11, PR 1). Re-asserted under the closeout's saturation burst **with the runtime-flag read on the path**: handoff p99 ≤ **0.25 ms** during 250 req @ 40 lanes (`shed_load` output), flat in `shed-proof-saturation-shed-impactguard.png` (IMPACT GUARD panel, ~230 µs p99). |
| 2 | **Fault-injection matrix green** (throw / hang-past-budget / pool-exhaust / kill-mid-stream / malformed) | **PROVEN** (harness, by design) + no regression | `tests/integration/test_shadow_integrated_system.py` — 46/46 shadow proof package green on host AND inside the dev-stack core container after the hot-detach change. The pool-exhaust and kill-mid-stream faults additionally occurred **live** during the closeout (real PoolTimeout sheds; real mid-stream flips) — contained + counted both times. |
| 3 | **Zero actuation** (`enforced:false` structural; response identical attached vs detached) | **PROVEN** + live corroboration | `tests/test_shadow_tap_wiring.py` (byte-identical response). Live: 195-request hot-detach run and 1082-request fail-safe run — every request 200, zero client-visible change across attach/detach/drain/re-attach; drained in-flight records still `enforced:false` (`test_flip_off_halts_new_dispatch_and_drains_in_flight`). |
| 4 | **Shed under saturation, live** — the closeout gap #2 | **PROVEN LIVE** | 250 governed requests @ 40 lanes: dedicated pool (cap **5**) hit in-flight peak **10–14** (high-water gauge `…_inflight_peak`), overflow shed as `write_failed` (+2 in the final clean run; +24/+207 in harder runs — all `httpx.PoolTimeout`/`ConnectTimeout`, verified by exception type in logs), **written kept flowing (248)**, impact guard flat (≤0.25 ms p99), **0 requests failed or delayed**, in-flight returned to 0. Simultaneous panels: `shed-proof-saturation-shed-impactguard.png`. Driver asserts all five conditions and fails otherwise. |
| 5 | **No PII in telemetry under concurrent scrape** | **PROVEN** (harness, by design) + no regression | `test_concurrent_metrics_scrape_under_load_has_no_pii_and_no_race` — green post-change. New flag/peak/recycle metrics carry no labels beyond the closed `outcome` set. |
| 6 | **Instant detach, live, as a runtime act** — the closeout gap #1 | **PROVEN LIVE** | The kill switch + %-gate are now **runtime flags in core's existing Redis** (`src/policy/shadow_flags.py`), flipped via authenticated `POST /internal/shadow-flags` or `redis-cli` — no restart/recreate/deploy. Live mid-stream: **halt 0.36 s** after flip (bound 2.5 s + slack), dispatched frozen while traffic continued, **in-flight drained** (332/332 terminal, 0 worker exceptions, gauge → 0), **re-attach 0.08 s** after flip-on, `process_start_time_seconds` unchanged (**same PID throughout**). `hot-detach-and-failsafe.png` + `shadow_hot_detach_live.py` output. |
| 6b | **Fail-safe: flag-store outage can only detach** | **PROVEN LIVE** | Redis stopped mid-traffic (env defaults saying *attached*): posture forced to `source:"failsafe", enabled:false` within one TTL, `dispatched` frozen (494 → 494), `skipped_failsafe` climbing (+228 over the outage), **1082 requests, 0 failures** (flag read never blocks the path even with Redis down). Redis restarted → automatic re-attach, dispatch resumed (494 → 671). Same render. |

Max flip propagation: **cache TTL (2 s) + one Redis read (≤0.5 s) = 2.5 s** at defaults;
measured halts were 0.36 s / 0.08 s. Documented in `INTEGRATION_RUNBOOK.md` §2–3.

---

## Findings from the live runs (the reason this closeout existed)

**Finding 1 — the first "live shed PASS" was a false positive, caught by its own 100% shed.**
The first driver run reported all assertions green with `write_failed: 300, written: 0`.
A 100%-shed is not overflow — investigation showed the driver's minted JWT used a
non-UUID `sub`, which connectors' internal audit route rejects (500) — **the driver's
bug, not a system shed**. Fixed (UUID subs); quiet writes then landed (`written`), and
the re-run showed the genuine mixed regime (276 written / 24 shed). Lesson encoded in
the driver: it now also asserts `written` flows, and its docstring says a failed
saturation is a finding, not an inconvenience.

**Finding 2 — a host clock jump wedged the dedicated pool permanently (real bug, fixed).**
Mid-session, a WSL2 suspend/resume clock jump left the long-lived httpx client's
internal pool bookkeeping wedged: **every** acquire raised `PoolTimeout` even with the
pool idle (a single quiet request shed; a direct `curl` to connectors succeeded in
9 ms). The shed path behaved exactly as designed the whole time — fast fail, counted,
request path untouched, impact guard flat — but shadow recording was dead until a
process restart, which contradicts the no-restart spirit of this phase. Fix: a **wedge
self-heal** in `shadow_pool.py` — the wedge signature is a `PoolTimeout` while tracked
in-flight is **at/below the connection cap** (a healthy pool cannot refuse an acquire
with nothing queued); a streak of signature hits with zero intervening successes
recycles the client (counted as `pool_recycled`).
*Sub-finding:* the first self-heal design (bare consecutive-timeout streak) **false-fired
3× under genuine hard saturation** in live testing — hard saturation legitimately
produces 20+ consecutive timeouts. Rejected and replaced with the in-flight-gated
signature; the follow-up live burst ran clean (248 written / 2 shed / 0 recycles).
Pinned by `tests/test_shadow_pool_selfheal.py` (wedge recycles; saturation never does;
successes reset; connect errors never recycle).

---

## Constraint compliance (diff-verified)

- **Zero actuation:** `_mark_only_sink` still forces `enforced:false / actuated:false /
  integration:shadow` on every record — untouched by this PR.
- **No worker→response path:** structurally absent; the hot-detach change touches only
  HOW attachment is toggled, drain = in-flight completing harmlessly.
- **No changes** to engine decision logic, pillar scoring, `route_inference()`,
  connectors, or prod. Core, dev only. (Diff scope: `src/policy/shadow_flags.py` [new],
  gate reads in `shadow_integration.py`, `/internal/shadow-flags` endpoints,
  startup warm/shutdown close, metrics additions, shadow_pool self-heal, tests,
  drivers, observability provisioning/renderer, docs.)
- **No new store:** the runtime flags live in core's existing Redis
  (`redis[hiredis]`, same `REDIS_URL`, `veldrix:shadow:*` namespace beside
  `veldrix:cb:*`). Fail-safe direction is detach-on-error — deliberately opposite the
  circuit breaker's stay-available fallback.
- **Default posture unchanged:** no keys + no env = OFF / 0%.

## Verification state at close

- Shadow proof package (isolation, zero-actuation, controls, integrated-system, fault
  matrix, hot-detach flags, self-heal): **46/46 green**, on host and inside the
  dev-stack core container.
- Full core suite: **448 passed** (host) + `tests/test_circuit_breaker_redis.py`
  **7/7 green in-container** (the five real-Redis tests still green with the new
  runtime-flag Redis usage).
- Live drivers: shed proof **PASSED** (final run 248/2/0-recycles, peak 14, p99 ≤0.25 ms,
  0 request failures), hot-detach proof **PASSED** (all 10 assertions), fail-safe
  session clean (1082/1082).

## What unblocks now

1. **CI/CD prod promotion phase** — promote the same mechanism through CI/CD, starting
   at 0% in prod (runtime flags make the prod ramp a no-deploy act).
2. **Connectors engine-vendoring phase** — per RECON-INT: vendor the proven engine into
   the connectors image, then repeat this exact out-of-band/shadow/dedicated-pool
   pattern there. Explicitly out of scope here.
