"""Internal observability endpoints — not exposed to SDK callers.

GET /internal/latency-stats   — per-pillar p50/p95/p99 + active tier slots
GET /internal/background-queue — background worker queue depth

Authentication: requires the X-Veldrix-Internal-Key header to match
VELDRIX_INTERNAL_API_KEY env var.  If the env var is unset the service is
assumed to be in dev mode and the endpoints are open (with a warning).
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Header, Request

from src.config.latency_tiers import LATENCY_TIERS

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
