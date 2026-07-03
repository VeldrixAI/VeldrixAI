# VeldrixAI — Policy Engine Operations & Rollout

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, on-call, customer success
> **Source of truth:** `backend/core/src/policy/runtime.py`, `mode_client.py` · long-form runbook in `docs/PRODUCTION_READINESS.md`

## Architecture in one paragraph

The pure Phase 1 engine is wrapped by a **runtime host** (`runtime.py`) adding the operational concerns: backpressure, a per-evaluation timeout budget, circuit-breaker awareness, metrics, and exactly one augmented audit record per decision. The host computes decisions via `engine.simulate()` (pure, no write) and emits one record — decision metadata merged with a `degradation` block and `actuated:false` — to the connectors append endpoint, which chains it into the audit hash chain. Per-tenant enforcement mode is read at request time from connectors (`mode_client.py`, cached, fail-safe to `shadow`). The engine remains **non-actuated**: it decides and records; only `block`/`escalate` can gate, and only in enforce modes.

## Degradation behavior

**Absolute rule: no degradation, timeout, or error path ever produces a silent `allow`.**

| Failure | Behavior | Signal |
|---|---|---|
| Signal collection overruns budget (`POLICY_EVAL_BUDGET_MS`, default 250 ms) | Proceed with partial signals; missing pillars → `evaluated:false` → fail closed for high/critical | `degradation.timeout_budget_exceeded`, metric `…fail_mode_activations_total{type="timeout_budget"}` |
| Provider tier degraded (inference circuit breaker not CLOSED) | Breaker state is *read* (never reimplemented) and recorded; missing tier's signal → `evaluated:false` | `degradation.degraded_provider_tiers`, `…provider_fallback_total{tier}` |
| Signal collector raises | Same as timeout — partial + fail closed for high/critical | `degradation.signal_collection_error` |
| Engine internal exception | Fails closed to `BLOCK` (treated critical), `engine_error` record | `…engine_errors_total` |
| Sustained overload | Shed with `BackpressureError` → 503-class; never an unbounded queue | `…shed_total` |
| Mode lookup fails (connectors down) | Resolves to `shadow` — a lookup error can only **de-gate**, never escalate into enforce | log `policy.mode_client.lookup_failed` |

**Tunables:** `POLICY_EVAL_BUDGET_MS` (250) · `POLICY_MAX_CONCURRENT_EVALS` (64) · `POLICY_BACKPRESSURE_WAIT_MS` (50) · `POLICY_MODE_CACHE_TTL_S` (5 — bounds how long a mode change/rollback takes to propagate).

## Observability

Both services expose `GET /metrics` (Prometheus). **Hard constraint: no governed content or PII in telemetry** — labels are closed enumerations only (verb, mode, pillar id, provider tier, tenant UUID); tests scan the exposition to prove it.

### Core metrics (engine runtime)
| Metric | Meaning |
|---|---|
| `veldrix_policy_eval_latency_seconds` | End-to-end evaluation latency (histogram → p50/p95/p99) |
| `veldrix_policy_phase_latency_seconds{phase}` | Per-phase timing: `collect` / `resolve` / `audit_write` |
| `veldrix_policy_decisions_total{action,mode}` | Decisions by verb and enforcement mode |
| `veldrix_policy_enforced_total{enforced}` | Actually gated (`true`) vs recorded-only (`false`) |
| `veldrix_policy_fail_mode_activations_total{type}` | Safe-fallback activations |
| `veldrix_policy_pillar_unevaluated_total{pillar}` | `evaluated:false` per pillar — directly exposes the bias fast-path skip rate |
| `veldrix_policy_engine_errors_total` | Engine errors (failed closed) |
| `veldrix_policy_provider_fallback_total{tier}` | Evaluations observing a degraded provider tier |
| `veldrix_policy_shed_total` | Backpressure sheds |

### Connectors metrics (chain health)
| Metric | Meaning |
|---|---|
| `veldrix_audit_chain_intact{tenant}` | 1 = chain verifies end-to-end, 0 = break/tamper found |
| `veldrix_audit_chain_last_verified_timestamp{tenant}` | Alert if `time() − this` grows large |
| `veldrix_audit_chain_length{tenant}` | Records at last verification |
| `veldrix_audit_chain_verifications_total{result}` | Verification passes by result |

Dashboards: **Policy Engine — Decision Records** (`policy-decision-record.json`) and **Audit Chain — Health** (`policy-chain-health.json`), auto-provisioned from `observability/grafana/dashboards/`.

## The shadow → enforce playbook

Flipping a tenant's production gating is the highest-stakes action in the product: it is **audited, authorized, and reversible**. Mode mutations require the `INTERNAL_SERVICE_TOKEN` header; if unset, mode changes are disabled (503). Every change writes its own tamper-evident audit record (who/when/from→to).

**Recommended staged path: `shadow → enforce_critical_only → enforce`.**

1. **Run in shadow** (default): engine decides and records, gates nothing.
2. **Pull the blast-radius report** from the tenant's own shadow history:
   ```
   GET /api/policy/internal/preflight-report?tenant_id=<uuid>&policy_id=<id>&days=14
   ```
   Returns `would_gate`, `would_gate_critical`, per-verb breakdown — the customer flips the switch having seen the impact on their own traffic.
3. **Stage to `enforce_critical_only`:**
   ```
   POST /api/policy/internal/enforcement-mode
   X-Internal-Token: <token>
   { "tenant_id":"…", "policy_id":"…", "mode":"enforce_critical_only",
     "actor":"alice@veldrix", "reason":"staged rollout step 1" }
   ```
4. **Promote to `enforce`** once critical-only behavior is confirmed (same call, `mode:"enforce"`).
5. **Instant rollback** — a single request-time flag write; no deploy, no migration; itself audited; effective everywhere within `POLICY_MODE_CACHE_TTL_S` (5 s):
   ```
   POST /api/policy/internal/enforcement-mode/rollback
   X-Internal-Token: <token>
   { "tenant_id":"…", "policy_id":"…", "actor":"oncall@veldrix", "reason":"<incident>" }
   ```

**Default-safe invariant:** a new/unconfigured tenant can only be created in `shadow`; bootstrapping straight into a gating mode is rejected (400). Enforcement is always explicit opt-in.

## Pre-deploy checklist

- [ ] `prometheus_client` in both core and connectors `requirements.txt`
- [ ] `INTERNAL_SERVICE_TOKEN` set in connectors env (else mode changes disabled)
- [ ] Migration `011_enforcement_mode_rollout.sql` reviewed (`policy_active_bindings` materializes on boot via `create_all` — connectors has no SQL migration runner)
- [ ] Grafana picks up both dashboards
- [ ] Scheduled job hits the chain-health refresh endpoint
- [ ] `GET /metrics` renders on both services with no payload content
