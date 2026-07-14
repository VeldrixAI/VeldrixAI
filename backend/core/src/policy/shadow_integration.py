"""Phase-6 out-of-band **shadow** integration of the Policy Engine into the core
request path (dev only).

The one rule (RECON-INT.md): the request path NEVER waits on, depends on, or can be
failed by the engine. This module is the *entire* coupling surface between the live
``POST /trust/evaluate`` handler and the proven engine, and it is built so that coupling
is provably one-directional and after-the-fact:

  * **Dispatch is post-response.** The handler calls :func:`dispatch_shadow_eval`, which
    (after a request-time kill-switch + sample gate) hands the work to FastAPI
    ``BackgroundTasks``. Background tasks run *after the response is sent*, so the worker
    contributes zero client-visible latency. The only thing on the request path is the
    gate check + ``add_task`` — measured by the impact-guard metric and asserted ~0.
  * **Total isolation in the worker.** :func:`_shadow_evaluate` catches everything —
    backpressure, timeout, engine fault, malformed signals, write failure — and records
    a counter. Nothing it does can propagate to the request (which already returned).
  * **Zero actuation, structural.** The worker runs *after* the response and has no code
    path back to it. Every record is forced ``enforced:false`` / ``actuated:false`` and
    marked ``integration:shadow`` regardless of the decided action — even a decided
    ``block`` is recorded, never applied.
  * **Dedicated pool.** All worker I/O (mode read + audit write) goes through the
    dedicated :mod:`src.policy.shadow_pool`, never the shared request-path HTTP pool, so
    worker load can never starve request handling of connections (RECON ⚠C-2).
  * **Real signals, no recompute.** The worker consumes the ``{pillar_id: PillarResult}``
    already produced on the live path and reuses the Phase-1
    ``SignalContext.from_pillar_results`` adapter (via the runtime). It never triggers
    new inference / ``route_inference()``.

Controls (read per-request at dispatch time — Phase-6 closeout: TRUE hot-detach):
  * Runtime flags in core's existing Redis (``veldrix:shadow:engine_enabled``,
    ``veldrix:shadow:sample_pct``), flippable with NO restart/recreate/deploy via
    ``POST /internal/shadow-flags`` or ``redis-cli`` — see :mod:`src.policy.shadow_flags`.
  * Env vars ``ENGINE_SHADOW_ENABLED`` / ``ENGINE_SHADOW_SAMPLE_PCT`` remain the static
    defaults when the runtime keys are absent (first-run posture unchanged: OFF / 0%).
  * Fail-safe: flag store unreachable → engine DETACHED (never attached), counted as the
    ``skipped_failsafe`` outcome.
Per-tenant enforcement mode is resolved (fail-safe ``shadow``) from connectors, but the
record is forced non-enforcing regardless — the mode is recorded only for honesty.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from typing import Any, Dict, Mapping, Optional

from fastapi import BackgroundTasks

from src.policy import runtime, shadow_flags
from src.policy.default_shadow_policy import get_default_shadow_policy
from src.policy.runtime import BackpressureError
from src.policy.schema import DEFAULT_ENFORCEMENT_MODE, EnforcementMode
from src.policy.shadow_pool import get_shadow_client, track_in_flight
from src.telemetry import policy_metrics as metrics

logger = logging.getLogger("veldrix.policy.shadow")

CONNECTORS_URL = os.getenv(
    "VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002")
)
_AUDIT_PATH = "/api/audit-trails/internal/audit-trail"
_MODE_PATH = "/api/policy/internal/enforcement-mode"
_MODE_CACHE_TTL_S = float(os.getenv("ENGINE_SHADOW_MODE_CACHE_TTL_S", "5"))

# (tenant_id, policy_id) -> (mode, expires_at_monotonic). Bounded by TTL, not load.
_mode_cache: Dict[tuple, tuple] = {}

# Strong references to in-flight worker coroutines, so a fire-and-forget dispatch path
# (if ever used outside BackgroundTasks, e.g. tests) is not GC'd mid-flight.
_INFLIGHT: "set[asyncio.Task]" = set()


# ── request-time controls (backed by the runtime flag store — hot-detach) ──────────

def shadow_enabled() -> bool:
    """Global kill switch, read at dispatch time. Default OFF (first-run 0% posture)."""
    return shadow_flags.current_flags().enabled


def sample_pct() -> float:
    """Configured sample percentage [0, 100], read at dispatch time. Default 0."""
    return shadow_flags.current_flags().sample_pct


def _should_sample(pct: float) -> bool:
    if pct <= 0.0:
        return False
    if pct >= 100.0:
        return True
    return random.random() * 100.0 < pct


# ── the request-path entry point (must never raise into the handler) ────────────────

def dispatch_shadow_eval(
    background_tasks: BackgroundTasks,
    *,
    pillar_results: Mapping[str, Any],
    composite_score: Optional[float],
    tenant_id: Optional[str],
    request_id: Optional[str],
) -> None:
    """Schedule an out-of-band shadow evaluation. Called from the live handler.

    This runs ON the request path, so it is wrapped to be non-blocking and
    exception-proof: it does the gate checks and a single ``add_task`` (which only
    appends to a list — FastAPI runs the coroutine after the response is sent). The
    impact-guard histogram captures the tiny latency this adds; it must stay ~0.
    """
    t0 = time.perf_counter()
    try:
        flags = shadow_flags.current_flags()  # cached local read (~0 cost; never awaits)
        if not flags.enabled:
            # Distinguish a deliberate detach from the fail-safe posture (flag store
            # unreachable → forced detached) so the fail-safe is visible as a metric.
            metrics.record_shadow_outcome(
                "skipped_failsafe" if flags.source == "failsafe" else "skipped_kill_switch"
            )
            return

        pct = flags.sample_pct
        metrics.set_shadow_sample_pct(pct)
        if not _should_sample(pct):
            metrics.record_shadow_outcome("skipped_unsampled")
            return

        # Snapshot the signals so the worker is decoupled from any later mutation of the
        # handler's objects. (PillarResult objects are themselves read-only here.)
        snapshot = dict(pillar_results)
        background_tasks.add_task(
            _shadow_evaluate,
            pillar_results=snapshot,
            composite_score=composite_score,
            tenant_id=tenant_id,
            request_id=request_id,
        )
        metrics.record_shadow_outcome("dispatched")
    except Exception as exc:  # the request path must NEVER be failed by dispatch
        # Best-effort accounting; swallow so the handler is unaffected.
        try:
            metrics.record_shadow_outcome("dropped_dispatch")
        except Exception:
            pass
        logger.error("policy.shadow.dispatch_failed request_id=%s: %s", request_id, exc)
    finally:
        metrics.observe_shadow_handoff(time.perf_counter() - t0)


# ── the out-of-band worker (runs after the response; total isolation) ───────────────

def _mark_only_sink(record: Dict[str, Any]) -> None:
    """Audit sink injected into the runtime: marks the record shadow + non-enforcing and
    does NOT write. The worker owns the write (via the dedicated pool) so the runtime
    never touches the shared request-path HTTP pool.

    Mutates the record in place; the runtime stores the same dict on
    ``RuntimeResult.audit_record``, so the markers travel to the worker's write.
    Forcing ``enforced=False`` here is the structural zero-actuation guarantee — even if
    the tenant's resolved mode is ``enforce`` and the decided action is ``block``.
    """
    record["enforced"] = False
    record["actuated"] = False
    record["integration"] = "shadow"


async def _shadow_evaluate(
    *,
    pillar_results: Mapping[str, Any],
    composite_score: Optional[float],
    tenant_id: Optional[str],
    request_id: Optional[str],
) -> None:
    """Run one shadow evaluation off the request path. Catches EVERYTHING."""
    worker_t0 = time.perf_counter()
    try:
        policy = get_default_shadow_policy()
        # Resolve the real per-tenant mode (recorded for honesty) via the DEDICATED pool,
        # then pass it explicitly so the runtime never calls mode_client (which would use
        # the shared request-path pool). Fail-safe shadow on any error.
        resolved_mode = await _resolve_mode(tenant_id, policy.policy_id)

        async def _collector(partial: Dict[str, Any]) -> None:
            # Signals are already computed on the live path — just hand them over.
            # No I/O, no inference, no recompute.
            partial.update(pillar_results)

        result = await runtime.evaluate(
            policy=policy,
            signal_collector=_collector,
            tenant_id=tenant_id,
            request_id=request_id,
            expected_pillars=list(pillar_results.keys()),
            signal_metadata={"composite_score": composite_score},
            mode=resolved_mode,
            audit_sink=_mark_only_sink,
        )
        await _write_shadow_record(result.audit_record, request_id)
    except BackpressureError:
        metrics.record_shadow_outcome("dropped_backpressure")
        logger.warning("policy.shadow.dropped_backpressure request_id=%s", request_id)
    except Exception as exc:  # noqa: BLE001 — an out-of-band worker must never escape
        metrics.record_shadow_outcome("worker_exception")
        logger.error(
            "policy.shadow.worker_exception request_id=%s: %s", request_id, exc, exc_info=True
        )
    finally:
        metrics.observe_shadow_worker_latency(time.perf_counter() - worker_t0)


async def _write_shadow_record(record: Dict[str, Any], request_id: Optional[str]) -> None:
    """POST the (already shadow-marked) decision record via the DEDICATED pool.

    Written THROUGH the connectors hash chain via the token-gated internal audit route.
    A distinct ``action_type`` keeps the chain dedup key meaningful and lets operators
    filter real-traffic shadow records from synthetic/seed ones.
    """
    is_error = bool(record.get("engine_error"))
    payload = {
        "action_type": "policy_engine_error_shadow" if is_error else "policy_decision_shadow",
        "entity_type": "policy_engine",
        "user_id": record.get("tenant_id"),
        "actor_email": None,
        "metadata": record,
    }
    target = f"{CONNECTORS_URL}{_AUDIT_PATH}"
    try:
        async with track_in_flight():
            client = get_shadow_client()
            resp = await client.post(target, json=payload)
        if resp.status_code >= 400:
            metrics.record_shadow_outcome("write_failed")
            logger.error(
                "policy.shadow.write_failed status=%s request_id=%s body=%.200s",
                resp.status_code, request_id, resp.text,
            )
        else:
            metrics.record_shadow_outcome("written")
    except Exception as exc:  # dedicated-pool exhaustion / connectors down → count, swallow
        metrics.record_shadow_outcome("write_failed")
        logger.error(
            "policy.shadow.write_exception request_id=%s url=%s: %s", request_id, target, exc
        )


# ── per-tenant mode resolution via the dedicated pool (fail-safe shadow) ────────────

def _coerce_mode(mode_str: Optional[str]) -> EnforcementMode:
    try:
        return EnforcementMode(mode_str)
    except (ValueError, TypeError):
        if mode_str is not None:
            logger.warning("policy.shadow.unknown_mode=%r → shadow (fail-safe)", mode_str)
        return DEFAULT_ENFORCEMENT_MODE


async def _resolve_mode(tenant_id: Optional[str], policy_id: str) -> EnforcementMode:
    """Resolve the tenant's enforcement mode via the DEDICATED pool. Fail-safe shadow.

    Cached with a short TTL so steady traffic does not hit connectors per request; the
    cache is bounded by TTL, never by request volume, so it cannot become a back-pressure
    surface. A lookup failure can only ever de-gate (→ shadow), never escalate.
    """
    key = (tenant_id, policy_id)
    now = time.monotonic()
    cached = _mode_cache.get(key)
    if cached is not None and cached[1] > now:
        return cached[0]

    mode = DEFAULT_ENFORCEMENT_MODE
    try:
        async with track_in_flight():
            client = get_shadow_client()
            resp = await client.get(
                f"{CONNECTORS_URL}{_MODE_PATH}",
                params={"tenant_id": tenant_id or "", "policy_id": policy_id},
            )
        if resp.status_code == 200:
            mode = _coerce_mode(resp.json().get("mode"))
        elif resp.status_code != 404:
            logger.warning(
                "policy.shadow.mode_lookup_status=%s tenant=%s → shadow",
                resp.status_code, tenant_id,
            )
    except Exception as exc:  # connectors unreachable / dedicated-pool exhausted → shadow
        logger.warning(
            "policy.shadow.mode_lookup_failed tenant=%s: %s → shadow", tenant_id, exc
        )
        mode = DEFAULT_ENFORCEMENT_MODE

    _mode_cache[key] = (mode, now + _MODE_CACHE_TTL_S)
    return mode


def invalidate_mode_cache(tenant_id: Optional[str] = None, policy_id: Optional[str] = None) -> None:
    """Drop cached mode entries (all, or for one tenant/policy). Used by tests + ops."""
    if tenant_id is None and policy_id is None:
        _mode_cache.clear()
        return
    for key in [k for k in _mode_cache if (tenant_id in (None, k[0]) and policy_id in (None, k[1]))]:
        _mode_cache.pop(key, None)
