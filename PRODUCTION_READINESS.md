# VeldrixAI Policy Engine — Production Readiness Runbook (Phase 2 / Part B)

This is the operator's guide to running the Policy Engine at enterprise scale: how it
degrades under failure, what every metric means, and the exact playbook for moving a
tenant from shadow to enforce (and back). It assumes Part A (tamper-evident,
append-only `audit_trails`) is already deployed.

> **Scope note.** Part B makes the engine *operable, observable, and safe to roll out*.
> It does **not** change pillar scoring, `route_inference()`, the Phase 1 decision
> logic, or the meaning of the honesty markers (`evaluated`, `actuated`, `enforced`,
> `mode`). The engine remains **non-actuated** (`actuated:false`): it decides and
> records, and `block`/`escalate` are the only verbs that gate.

---

## 1. Architecture in one paragraph

The pure Phase 1 engine (`backend/core/src/policy/engine.py`) is wrapped by a **runtime
host** (`backend/core/src/policy/runtime.py`) that adds the operational concerns:
backpressure, a per-evaluation timeout budget, circuit-breaker awareness, metrics, and
a single augmented audit record per decision. The host computes the decision via
`engine.simulate()` (pure, no write) and then emits exactly one record —
`to_audit_metadata()` merged with a `degradation` block and `actuated:false` — to the
existing connectors append endpoint, which chains it into the Part A hash chain. The
per-tenant enforcement mode is read at request time from connectors via
`mode_client.py` (cached, fail-safe to `shadow`).

---

## 2. Degradation behavior (B.1)

**Absolute rule: no degradation, timeout, or error path ever produces a silent `allow`.**
Missing signals are never fabricated as passing; a high/critical rule that references a
missing signal fails closed. Every fallback is recorded in the decision record's
`degradation` block and emitted as a metric.

| Failure | Behavior | Where it shows up |
|---|---|---|
| **Signal collection overruns the budget** (`POLICY_EVAL_BUDGET_MS`, default 250ms) | Proceed with the signals that arrived; missing pillars stay absent → `evaluated:false` → fail closed for high/critical | `degradation.timeout_budget_exceeded=true`, `degradation.missing_signals`, metric `veldrix_policy_fail_mode_activations_total{type="timeout_budget"}` |
| **Provider tier degraded** (NIM→Groq→Bedrock→OSS breaker not `CLOSED`) | Breaker state is *read* (never reimplemented) and recorded; the missing tier's signal is `evaluated:false` | `degradation.degraded_provider_tiers`, `degradation.provider_fallback_fired`, metric `veldrix_policy_provider_fallback_total{tier=...}` |
| **Signal collector raises** | Same as timeout — proceed with partial, fail closed for high/critical | `degradation.signal_collection_error` |
| **Engine internal exception** | Phase 1 already fails closed to `BLOCK` (treated critical) and writes an `engine_error` record | metric `veldrix_policy_engine_errors_total`, `record_kind="policy_engine_error"` |
| **Sustained overload** | Shed with `BackpressureError` → caller returns a 503-class signal; never an unbounded queue | metric `veldrix_policy_shed_total` |
| **Mode lookup fails** (connectors down) | `mode_client` resolves to `shadow` (fail-safe — a lookup error can only *de*-gate, never escalate into enforce) | core log `policy.mode_client.lookup_failed` |

**Tunables (env):**
- `POLICY_EVAL_BUDGET_MS` (default `250`) — hard wall-clock budget for signal collection.
- `POLICY_MAX_CONCURRENT_EVALS` (default `64`) — backpressure bound; surplus is shed.
- `POLICY_BACKPRESSURE_WAIT_MS` (default `50`) — how long a request waits for a slot before being shed.
- `POLICY_MODE_CACHE_TTL_S` (default `5`) — bounds how long a mode change / rollback takes to propagate everywhere.

---

## 3. Observability (B.2)

Metrics are exposed on `GET /metrics` for both services and scraped by the existing
`observability/prometheus.yml` (`veldrix-core:8001`, `veldrix-connectors:8002`).
`prometheus_client` is the only new dependency; if absent it degrades to no-ops.

**Hard constraint: no governed content / PII in telemetry.** Every label is a closed
enumeration — verb, mode, pillar id, provider tier, tenant UUID — never request text,
signal values, or any payload field. (`tests/test_policy_metrics.py` and
`test_chain_health_metrics.py` scan the exposition to prove this.)

### Core metrics (Policy Engine runtime)
| Metric | Meaning |
|---|---|
| `veldrix_policy_eval_latency_seconds` (histogram) | End-to-end evaluation latency. Use `histogram_quantile` for p50/p95/p99. |
| `veldrix_policy_phase_latency_seconds{phase}` | Per-phase timing (`collect`/`resolve`/`audit_write`) — the "trace" for a slow request. |
| `veldrix_policy_decisions_total{action,mode}` | Decisions reached, by verb and enforcement mode. |
| `veldrix_policy_enforced_total{enforced}` | Whether decisions actually gated (`true`) vs were recorded only (`false`). |
| `veldrix_policy_fail_mode_activations_total{type}` | Safe-fallback activations (`timeout_budget`, `fail_closed`, `engine_error`, `provider_degraded`). |
| `veldrix_policy_pillar_unevaluated_total{pillar}` | `evaluated:false` count per pillar — **directly exposes the bias score=92 fast-path / skip frequency.** |
| `veldrix_policy_engine_errors_total` | Engine internal errors (failed closed). |
| `veldrix_policy_provider_fallback_total{tier}` | Evaluations observing a degraded provider tier. |
| `veldrix_policy_shed_total` | Backpressure shed events. |

### Connectors metrics (audit chain health)
| Metric | Meaning |
|---|---|
| `veldrix_audit_chain_intact{tenant}` | `1` if the tenant's hash chain verifies end-to-end, `0` if a break/tamper was found. |
| `veldrix_audit_chain_last_verified_timestamp{tenant}` | Unix time of last verification. Alert if `time() -` this grows large. |
| `veldrix_audit_chain_length{tenant}` | Records in the chain at last verification. |
| `veldrix_audit_chain_verifications_total{result}` | Verification passes by result (`intact`/`broken`). |

Chain verification is DB work, so it is **not** run on every scrape. Drive it on a
schedule (ops/cron) against the internal endpoints:
- `GET  /api/audit-trails/internal/chain-health?tenant_id=<uuid>` — verify one tenant.
- `POST /api/audit-trails/internal/chain-health/refresh` — verify every tenant.

### Dashboards
Provisioned from `observability/grafana/dashboards/`:
- **Policy Engine — Decision Records** (`policy-decision-record.json`): the shadow-mode
  "decided vs enforced=false" blast-radius view, decisions by verb/mode, `evaluated:false`
  rate, fail-mode activations, latency quantiles, fallback/shed counts.
- **Audit Chain — Health** (`policy-chain-health.json`): per-tenant intact / last-verified
  / length, and a global "any chain broken?" stat.

---

## 4. The shadow → enforce playbook (B.3)

Flipping a design partner's production gating is the highest-stakes action in the
product. It is therefore an **audited, authorized, reversible** operation. Every change
writes its own tamper-evident audit record (who / when / from→to) into the tenant's
hash chain. Mutations require the `INTERNAL_SERVICE_TOKEN` header; if that env var is
unset, mode changes are **disabled** (503) — gating can never be flipped by an
unauthenticated caller. The default for every new/unconfigured tenant is `shadow`, and
the tooling refuses to create a binding in any other mode.

**Recommended staged path: `shadow → enforce_critical_only → enforce`.**

1. **Run in shadow (default).** The engine decides and records but gates nothing.
2. **Pull the blast-radius report** from the tenant's own shadow history:
   ```
   GET /api/policy/internal/preflight-report?tenant_id=<uuid>&policy_id=<id>&days=14
   ```
   Returns `would_gate`, `would_gate_critical`, and a per-verb breakdown — "in the last
   14 days, enforce mode would have gated X requests, Y of them critical." The customer
   flips the switch having seen the impact on their *own* traffic.
3. **Stage to `enforce_critical_only`** (gate catastrophic, shadow the rest):
   ```
   POST /api/policy/internal/enforcement-mode
   X-Internal-Token: <token>
   { "tenant_id":"<uuid>", "policy_id":"<id>", "mode":"enforce_critical_only",
     "actor":"alice@veldrix", "reason":"staged rollout step 1" }
   ```
4. **Promote to `enforce`** once critical-only behavior is confirmed (same call, `mode:"enforce"`).
5. **Instant rollback** if anything looks wrong — a single request-time flag write, no
   deploy, no migration, and itself audited:
   ```
   POST /api/policy/internal/enforcement-mode/rollback
   X-Internal-Token: <token>
   { "tenant_id":"<uuid>", "policy_id":"<id>", "actor":"oncall@veldrix", "reason":"<incident>" }
   ```
   Rollback takes effect within `POLICY_MODE_CACHE_TTL_S` (default 5s) everywhere.

**Default-safe invariant:** a new/unconfigured tenant can only be set to `shadow` first;
moving to `enforce_critical_only`/`enforce` requires an existing binding — enforcement is
always an explicit opt-in. The tooling rejects (400) any attempt to bootstrap a tenant
straight into a gating mode.

---

## 5. Pre-deploy checklist

- [ ] `prometheus_client` installed in core **and** connectors (in both `requirements.txt`).
- [ ] `INTERNAL_SERVICE_TOKEN` set in the connectors environment (else mode changes are disabled).
- [ ] Migration `011_enforcement_mode_rollout.sql` reviewed; `policy_active_bindings`
      materializes on boot via `create_all` (connectors has no SQL migration runner).
- [ ] Grafana picks up the two new dashboards from `observability/grafana/dashboards/`.
- [ ] A scheduled job calls the chain-health refresh endpoint so chain-intact gauges stay fresh.
- [ ] Confirm `GET /metrics` renders on both services and contains no payload content.
