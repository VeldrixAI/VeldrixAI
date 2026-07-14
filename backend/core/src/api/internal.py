"""Internal observability + control endpoints — not exposed to SDK callers.

GET    /internal/latency-stats    — per-pillar p50/p95/p99 + active tier slots
GET    /internal/background-queue — background worker queue depth
GET    /internal/shadow-flags     — effective shadow-engine runtime flags (fresh read)
POST   /internal/shadow-flags     — flip the shadow-engine attach/sample flags (hot; NO restart)
DELETE /internal/shadow-flags     — clear the runtime flags (env defaults rule again)

Authentication: requires the X-Veldrix-Internal-Key header to match
VELDRIX_INTERNAL_API_KEY env var.  If the env var is unset the service is
assumed to be in dev mode and the endpoints are open (with a warning).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, Field

from src.config.latency_tiers import LATENCY_TIERS
from src.policy import shadow_flags

logger = logging.getLogger("veldrix.internal")
router = APIRouter(prefix="/internal", tags=["Internal"])

_INTERNAL_KEY_ENV = "VELDRIX_INTERNAL_API_KEY"


def _require_internal_key(
    x_veldrix_internal_key: str = Header(None, alias="X-Veldrix-Internal-Key"),
    authorization: str = Header(None),
) -> None:
    """
    Accepts key via X-Veldrix-Internal-Key header or Authorization: Bearer.
    Open in dev mode (env var not set) with a warning log.
    """
    expected = os.getenv(_INTERNAL_KEY_ENV, "")
    if not expected:
        logger.warning(
            "VELDRIX_INTERNAL_API_KEY not set — /internal endpoints are OPEN. "
            "Set this variable in production."
        )
        return

    # Accept from either header
    provided = x_veldrix_internal_key
    if not provided and authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()

    if provided != expected:
        raise HTTPException(status_code=403, detail="Invalid internal key")


@router.get(
    "/latency-stats",
    summary="Per-pillar latency statistics and active SLA tier slot values",
)
async def latency_stats(
    request: Request,
    _: None = Depends(_require_internal_key),
) -> dict:
    """
    Returns per-pillar rolling p50/p95/p99 plus the current slot allocations
    for each SLA tier.  The adaptive tuner modifies STANDARD slots at runtime;
    this endpoint reflects the live values.
    """
    collector = getattr(request.app.state, "latency_collector", None)
    stats = collector.get_stats() if collector else {"pillars": {}, "requests": {}}

    return {
        "stats": stats,
        "tiers": {
            tier_name: {
                "total_budget_ms": budget.total_budget_ms,
                "background_mode": budget.background_mode,
                "slots": {
                    "safety_ms":          budget.pillar_slots.safety_ms,
                    "hallucination_ms":   budget.pillar_slots.hallucination_ms,
                    "bias_ms":            budget.pillar_slots.bias_ms,
                    "prompt_security_ms": budget.pillar_slots.prompt_security_ms,
                    "compliance_ms":      budget.pillar_slots.compliance_ms,
                },
            }
            for tier_name, budget in LATENCY_TIERS.items()
        },
    }


@router.get(
    "/background-queue",
    summary="Background evaluation worker task count",
)
async def background_queue(
    request: Request,
    _: None = Depends(_require_internal_key),
) -> dict:
    worker = getattr(request.app.state, "background_worker", None)
    count = worker.active_task_count if worker else 0
    return {
        "active_tasks": count,
        "status": "healthy" if count < 500 else "backpressure",
    }


# ── Phase-6 hot-detach: the shadow-engine runtime flag control ─────────────────────
# Flipping these takes effect with NO restart/recreate/deploy: the value lands in
# core's Redis and every worker converges within one flag-cache TTL. This endpoint
# changes only HOW the (already out-of-band, zero-actuation) engine is attached —
# it cannot enforce anything; enforced:false remains structural.

class ShadowFlagsUpdate(BaseModel):
    enabled: Optional[bool] = None
    sample_pct: Optional[float] = Field(None, ge=0.0, le=100.0)


def _flag_state_body(state: shadow_flags.FlagState) -> dict:
    ttl = float(os.getenv("ENGINE_SHADOW_FLAG_CACHE_TTL_S", "2"))
    timeout = float(os.getenv("ENGINE_SHADOW_FLAG_REDIS_TIMEOUT_S", "0.5"))
    return {
        "enabled": state.enabled,
        "sample_pct": state.sample_pct,
        "source": state.source,  # redis | env | failsafe
        "cache_ttl_s": ttl,
        "max_propagation_s": ttl + timeout,
    }


@router.get(
    "/shadow-flags",
    summary="Effective shadow-engine runtime flags (fresh flag-store read)",
)
async def get_shadow_flags(_: None = Depends(_require_internal_key)) -> dict:
    state = await shadow_flags.refresh()  # fresh read; failsafe posture reported honestly
    return _flag_state_body(state)


@router.post(
    "/shadow-flags",
    summary="Flip the shadow-engine attach/sample flags at runtime (no restart)",
)
async def set_shadow_flags(
    update: ShadowFlagsUpdate,
    _: None = Depends(_require_internal_key),
) -> dict:
    if update.enabled is None and update.sample_pct is None:
        raise HTTPException(status_code=400, detail="Provide enabled and/or sample_pct")
    try:
        state = await shadow_flags.set_flags(
            enabled=update.enabled, sample_pct=update.sample_pct
        )
    except Exception as exc:
        # Unwritable flag store ≠ attached engine: readers are already fail-safe detached.
        raise HTTPException(
            status_code=503,
            detail=f"Flag store unreachable ({type(exc).__name__}) — engine is "
                   "fail-safe DETACHED on all workers until the store recovers.",
        )
    logger.info("shadow-flags flipped: %s", _flag_state_body(state))
    return _flag_state_body(state)


@router.delete(
    "/shadow-flags",
    summary="Clear the runtime flags — env defaults become effective again",
)
async def delete_shadow_flags(_: None = Depends(_require_internal_key)) -> dict:
    try:
        state = await shadow_flags.clear_flags()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Flag store unreachable ({type(exc).__name__}) — engine is "
                   "fail-safe DETACHED on all workers until the store recovers.",
        )
    return _flag_state_body(state)
