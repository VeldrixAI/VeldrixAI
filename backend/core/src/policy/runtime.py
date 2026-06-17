"""The Policy Engine *runtime host* — Part B / B.1 (Safe Fallbacks & Graceful Degradation).

The Phase 1 engine (``engine.py``) is pure, deterministic, and sub-millisecond. It is
NOT, however, where production failures happen: those happen *upstream*, while pillar
signals are collected through the ``route_inference()`` provider chain (NIM→Groq→
Bedrock→OSS). This module wraps the pure engine with the operational concerns that make
it safe to run at enterprise scale — **without changing a single engine decision**:

  1. **Backpressure** — a bounded concurrency gate. Under sustained overload the runtime
     sheds with a clear 503-class signal (``BackpressureError``) rather than queueing
     unboundedly.
  2. **Timeout budget** — a hard per-evaluation wall-clock budget around signal
     collection. If collection overruns, the runtime proceeds with the signals it *has*;
     the missing ones stay absent so the context marks them ``evaluated:false`` and the
     engine fails closed for high/critical (never a silent pass).
  3. **Circuit-breaker awareness** — reads the existing per-provider breaker state
     (``circuit_breaker.async_get_all_states``) and records the degraded posture. It does
     NOT reimplement the breaker.
  4. **Honest, observable degradation** — every fallback (timeout, degraded tier, engine
     error, fail-closed) is captured in the decision record's ``degradation`` block and
     emitted as a Prometheus metric. No degradation path can produce a silent ``allow``.

Design rule: the runtime computes the decision via ``engine.simulate()`` (pure, no
write), then emits **exactly one** audit record itself — ``decision.to_audit_metadata()``
merged with the ``degradation`` block and the carried-forward ``actuated:false`` honesty
marker (decision verbs are not yet wired to a response-path runtime). The engine's
single-write contract and decision logic are untouched.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    Mapping,
    MutableMapping,
    Optional,
)

from src.policy.context import SignalContext
from src.policy.engine import Decision, PolicyEngine
from src.policy.schema import EnforcementMode, FailMode, Policy
from src.telemetry import policy_metrics as metrics

logger = logging.getLogger("veldrix.policy.runtime")

# A collector fills the passed mutable mapping with ``{pillar_id: PillarResult}`` as each
# pillar completes. The incremental-fill contract is what lets the runtime proceed with
# partial signals when the timeout budget is exceeded (a returned-mapping contract would
# lose everything on cancellation).
SignalCollector = Callable[[MutableMapping[str, Any]], Awaitable[None]]

# ── Tunables (env-overridable; documented in PRODUCTION_READINESS.md) ─────────────
_DEFAULT_BUDGET_MS = int(os.getenv("POLICY_EVAL_BUDGET_MS", "250"))
_DEFAULT_MAX_CONCURRENT = int(os.getenv("POLICY_MAX_CONCURRENT_EVALS", "64"))
_DEFAULT_BACKPRESSURE_WAIT_MS = int(os.getenv("POLICY_BACKPRESSURE_WAIT_MS", "50"))


class BackpressureError(Exception):
    """Raised when the runtime sheds an evaluation under sustained overload.

    Callers should surface this as a 503-class signal (Retry-After) — the system is
    deliberately rejecting work rather than queueing it unboundedly.
    """


@dataclass
class RuntimeResult:
    """The host's result: the pure decision plus the operational envelope around it."""

    decision: Decision
    mode: EnforcementMode
    degradation: Dict[str, Any]
    audit_record: Dict[str, Any]
    eval_latency_s: float = 0.0
    phase_timings_s: Dict[str, float] = field(default_factory=dict)


# ── Backpressure state (bounded concurrency, never an unbounded queue) ────────────
_sema: Optional[asyncio.Semaphore] = None
_sema_size: int = _DEFAULT_MAX_CONCURRENT
_in_flight: int = 0


def configure(*, max_concurrent: Optional[int] = None) -> None:
    """Reconfigure runtime bounds (used by ops + tests). Recreates the gate."""
    global _sema, _sema_size, _in_flight
    if max_concurrent is not None:
        _sema_size = max_concurrent
    _sema = None
    _in_flight = 0


def _get_sema() -> asyncio.Semaphore:
    global _sema
    if _sema is None:
        _sema = asyncio.Semaphore(_sema_size)
    return _sema


# ── Default engine + audit sink (shared, swappable in tests) ──────────────────────
_engine: Optional[PolicyEngine] = None


def _default_engine() -> PolicyEngine:
    global _engine
    if _engine is None:
        _engine = PolicyEngine()
    return _engine


async def evaluate(
    *,
    policy: Policy,
    signal_collector: SignalCollector,
    tenant_id: Optional[str] = None,
    request_id: Optional[str] = None,
    expected_pillars: Optional[Iterable[str]] = None,
    signal_metadata: Optional[Mapping[str, Any]] = None,
    mode: Optional[EnforcementMode] = None,
    budget_ms: Optional[int] = None,
    backpressure_wait_ms: Optional[int] = None,
    engine: Optional[PolicyEngine] = None,
    audit_sink: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> RuntimeResult:
    """Run one production-grade policy evaluation around the pure engine.

    Args:
        policy: The loaded :class:`Policy` (its decision logic is never altered here).
        signal_collector: Async callable that fills a passed mapping with
            ``{pillar_id: PillarResult}``. Wrapped in the timeout budget.
        tenant_id / request_id: Carried into the decision record and the mode lookup.
        expected_pillars: Pillar ids expected this evaluation — used to report which
            signals were *missing* after a timeout (observability only; never injected).
        signal_metadata: Optional request metadata forwarded to
            :meth:`SignalContext.from_pillar_results` (region, action_class,
            data_categories, blast_radius, composite_score).
        mode: Explicit enforcement mode; if omitted it is resolved (fail-safe to
            ``shadow``) from the connectors mode store via :mod:`src.policy.mode_client`.
        budget_ms: Per-evaluation signal-collection budget (default ``POLICY_EVAL_BUDGET_MS``).
        engine / audit_sink: Injection points for tests.

    Returns:
        A :class:`RuntimeResult`.

    Raises:
        BackpressureError: the evaluation was shed under sustained overload.
    """
    budget_ms = budget_ms if budget_ms is not None else _DEFAULT_BUDGET_MS
    wait_ms = backpressure_wait_ms if backpressure_wait_ms is not None else _DEFAULT_BACKPRESSURE_WAIT_MS
    engine = engine if engine is not None else _default_engine()
    expected = list(expected_pillars or [])

    # ── 1. Backpressure gate — shed rather than queue unboundedly ────────────────
    global _in_flight
    sema = _get_sema()
    try:
        await asyncio.wait_for(sema.acquire(), timeout=wait_ms / 1000.0)
    except asyncio.TimeoutError:
        metrics.record_shed()
        logger.warning(
            "policy.runtime.shed request_id=%s in_flight=%s max=%s — backpressure",
            request_id, _in_flight, _sema_size,
        )
        raise BackpressureError(
            f"Policy runtime at capacity (max_concurrent={_sema_size}); shedding."
        )

    _in_flight += 1
    t_total0 = time.perf_counter()
    phase: Dict[str, float] = {}
    try:
        # ── 2. Signal collection under a hard timeout budget ─────────────────────
        partial: Dict[str, Any] = {}
        timeout_exceeded = False
        collection_error: Optional[str] = None
        t0 = time.perf_counter()
        try:
            await asyncio.wait_for(signal_collector(partial), timeout=budget_ms / 1000.0)
        except asyncio.TimeoutError:
            timeout_exceeded = True
            logger.warning(
                "policy.runtime.timeout request_id=%s budget_ms=%s collected=%s — "
                "proceeding with partial signals (missing → evaluated:false)",
                request_id, budget_ms, sorted(partial.keys()),
            )
        except Exception as exc:  # noqa: BLE001 — collection failure must not pass silently
            collection_error = f"{type(exc).__name__}: {exc}"
            logger.error(
                "policy.runtime.signal_collection_error request_id=%s: %s",
                request_id, collection_error,
            )
        phase["collect"] = time.perf_counter() - t0

        # Build the typed context from whatever arrived. Missing pillars are simply
        # absent → context marks them evaluated:false (NEVER a fabricated pass).
        meta = dict(signal_metadata or {})
        ctx = SignalContext.from_pillar_results(partial, **meta)
        missing_signals = [p for p in expected if p not in partial]

        # ── 3. Circuit-breaker awareness (consume, never reimplement) ────────────
        breaker_states: Dict[str, str] = {}
        try:
            from src.inference.circuit_breaker import async_get_all_states

            breaker_states = await async_get_all_states()
        except Exception as exc:  # breaker introspection must never break a decision
            logger.warning("policy.runtime.breaker_state_unavailable: %s", exc)
        degraded_tiers = [n for n, s in breaker_states.items() if s != "CLOSED"]

        # ── 4. Resolve enforcement mode (fail-safe to shadow) ────────────────────
        resolved_mode = mode
        if resolved_mode is None:
            from src.policy import mode_client

            resolved_mode = await mode_client.get_mode(tenant_id, policy.policy_id)

        # ── 5. Pure decision (engine untouched) ──────────────────────────────────
        t0 = time.perf_counter()
        decision = engine.simulate(
            policy, ctx, resolved_mode, tenant_id=tenant_id, request_id=request_id
        )
        phase["resolve"] = time.perf_counter() - t0

        # ── 6. Build the degradation envelope (counts/verbs/states only — no PII) ─
        degradation: Dict[str, Any] = {
            "timeout_budget_ms": budget_ms,
            "timeout_budget_exceeded": timeout_exceeded,
            "signal_collection_error": collection_error,
            "missing_signals": missing_signals,
            "provider_breaker_states": breaker_states,
            "degraded_provider_tiers": degraded_tiers,
            "provider_fallback_fired": bool(degraded_tiers),
            "backpressure": {"max_concurrent": _sema_size, "in_flight": _in_flight},
            "phase_timings_ms": {k: round(v * 1000, 3) for k, v in phase.items()},
        }

        # ── 7. Emit exactly ONE augmented audit record ───────────────────────────
        record = decision.to_audit_metadata()
        record["actuated"] = False  # carry-forward honesty marker (no response-path runtime)
        record["degradation"] = degradation
        t0 = time.perf_counter()
        sink = audit_sink if audit_sink is not None else _default_sink()
        try:
            sink(record)
        except Exception as exc:  # an audit-sink failure must never break enforcement
            logger.error("policy.runtime.audit_sink_failed request_id=%s: %s", request_id, exc)
        phase["audit_write"] = time.perf_counter() - t0

        total = time.perf_counter() - t_total0
        _emit_metrics(decision, resolved_mode, ctx, timeout_exceeded, degraded_tiers, total, phase)
        logger.info(
            "policy.runtime.eval request_id=%s action=%s mode=%s enforced=%s "
            "engine_error=%s timeout=%s degraded_tiers=%s total_ms=%.3f",
            request_id, decision.decided_action.value, resolved_mode.value,
            decision.enforced, decision.engine_error, timeout_exceeded,
            degraded_tiers, total * 1000,
        )
        return RuntimeResult(
            decision=decision,
            mode=resolved_mode,
            degradation=degradation,
            audit_record=record,
            eval_latency_s=total,
            phase_timings_s=dict(phase),
        )
    finally:
        _in_flight -= 1
        sema.release()


def _default_sink() -> Callable[[Dict[str, Any]], None]:
    from src.policy.audit_bridge import emit_decision_record

    return emit_decision_record


def _emit_metrics(
    decision: Decision,
    mode: EnforcementMode,
    ctx: SignalContext,
    timeout_exceeded: bool,
    degraded_tiers: list,
    total_s: float,
    phase: Dict[str, float],
) -> None:
    """Translate one evaluation's outcome into Prometheus metrics (no PII)."""
    metrics.observe_eval_latency(total_s)
    for name, secs in phase.items():
        metrics.observe_phase(name, secs)
    metrics.record_decision(decision.decided_action.value, mode.value, decision.enforced)

    # Per-pillar evaluated:false rate — surfaces the score=92 fast-path / skip frequency.
    for key, val in ctx.values.items():
        if key.endswith("_evaluated") and val is False:
            metrics.record_pillar_unevaluated(key[: -len("_evaluated")])

    if timeout_exceeded:
        metrics.record_fail_mode("timeout_budget")
    if decision.engine_error:
        metrics.record_fail_mode("engine_error")
        metrics.record_engine_error()
    if decision.fail_mode_applied == FailMode.FAIL_CLOSED:
        metrics.record_fail_mode("fail_closed")
    for tier in degraded_tiers:
        metrics.record_fail_mode("provider_degraded")
        metrics.record_provider_fallback(tier)
