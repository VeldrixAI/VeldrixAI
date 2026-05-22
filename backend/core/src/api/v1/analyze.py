"""
POST /api/v1/analyze — VeldrixAI trust analysis endpoint.

Single entry point for all trust evaluations.  Runs all five pillars in
parallel and returns a unified AnalysisResult with per-pillar breakdown.

Latency governor:
  LatencyBudgetMiddleware attaches a LatencyBudget to request.state before
  this handler runs.  The budget carries the SLA tier and per-pillar slot
  allocations.  When background=True the evaluation is queued via
  BackgroundEvaluationWorker and this handler returns in <10 ms.

Latency recording (v2.0):
  Every successful SDK evaluation produces a latency record in the
  request_latency table (via fire-and-forget task with strong reference).
  This ensures the dashboard's avg / p95 metrics reflect real SDK traffic.
  Failures are logged at WARNING level so they are visible in production.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.v1.dependencies import get_sdk, require_api_key
from src.core.http_pool import get_internal_client
from src.sdk.client import VeldrixSDK
from src.sdk.models import AnalysisRequest

router = APIRouter(prefix="/api/v1", tags=["Analysis"])
logger = logging.getLogger("veldrix.api")

# Monthly evaluation quotas per plan tier (-1 = unlimited)
_PLAN_QUOTAS: dict[str, int] = {
    "free":       1_000,
    "grow":      25_000,
    "scale":    150_000,
    "enterprise": -1,
}

# Strong-reference set for fire-and-forget latency recording tasks.
# Prevents GC from collecting the task before it runs (same pattern as
# middleware.py's _MIDDLEWARE_TASKS and http_interceptor.py's _INTERCEPT_TASKS).
_LATENCY_TASKS: Set[asyncio.Task] = set()

_CONNECTORS_URL: Optional[str] = None


def _get_connectors_url() -> str:
    """Lazy-resolve the connectors service URL (cached after first read)."""
    global _CONNECTORS_URL
    if _CONNECTORS_URL is None:
        import os
        _CONNECTORS_URL = os.getenv(
            "VELDRIX_CONNECTORS_URL",
            os.getenv("CONNECTORS_URL", "http://localhost:8002"),
        )
    return _CONNECTORS_URL


@router.post(
    "/analyze",
    response_model=None,
    summary="Run full five-pillar trust analysis",
    description=(
        "Submits a prompt+response pair through all five VeldrixAI trust pillars "
        "(Safety, Hallucination, Bias, Prompt Security, Compliance) in parallel "
        "and returns a unified TrustScore with per-pillar breakdown.\n\n"
        "Set `background: true` in the request body (or X-Veldrix-SLA-Tier: BACKGROUND) "
        "to return immediately while evaluation runs asynchronously."
    ),
)
async def analyze(
    payload: AnalysisRequest,
    http_request: Request,
    debug:   bool       = False,
    sdk:     VeldrixSDK = Depends(get_sdk),
    caller:  dict       = Depends(require_api_key),
):
    request_start = time.monotonic()
    user_id = caller.get("user_id")

    # ── Quota enforcement ─────────────────────────────────────────────────────
    plan_tier  = caller.get("plan_tier", "free")
    eval_count = caller.get("eval_count_month", 0)
    quota      = _PLAN_QUOTAS.get(plan_tier, 1_000)
    if quota != -1 and eval_count > quota:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Monthly evaluation quota of {quota:,} exceeded on the {plan_tier!r} plan. "
                "Upgrade at app.veldrixai.ca/dashboard/billing"
            ),
            headers={"X-Quota-Limit": str(quota), "X-Quota-Used": str(eval_count)},
        )

    # ── Read budget from middleware ──
    budget    = getattr(http_request.state, "latency_budget", None)
    collector = getattr(http_request.app.state, "latency_collector", None)
    bg_worker = getattr(http_request.app.state, "background_worker", None)

    # Determine whether this is a background request
    is_background = (
        payload.background
        or (budget is not None and budget.background_mode)
    )

    # ── BACKGROUND MODE — return immediately ──────────────────────────────────
    if is_background and bg_worker is not None:
        request_id = getattr(http_request.state, "request_id", None) or str(__import__("uuid").uuid4())
        bg_worker.submit(
            request=payload,
            request_id=request_id,
            user_id=user_id,
            actor_email=caller.get("email"),
            webhook_url=payload.webhook_url,
        )
        return {
            "request_id": request_id,
            "status":     "accepted",
            "mode":       "background",
            "tier":       budget.tier if budget else "BACKGROUND",
            "message":    "Evaluation queued. Results written to audit log.",
        }

    # ── SYNC MODE — evaluate within budget ───────────────────────────────────
    try:
        result = await sdk.analyze(
            payload,
            user_id=user_id,
            actor_email=caller.get("email"),
            budget=budget,
            collector=collector,
            request_id=getattr(http_request.state, "request_id", None),
            emit_diagnostics=debug,
        )

        # ── Record latency to connectors (fire-and-forget with strong ref) ────
        # Every successful SDK call records its total_latency_ms so the
        # dashboard's avg/p95 SLA metrics include SDK evaluation times.
        elapsed_ms = round((time.monotonic() - request_start) * 1000)
        if user_id and elapsed_ms > 0:
            _fire_latency_record(user_id, "/api/v1/analyze", float(elapsed_ms))

        return result

    except Exception as exc:
        # Even on failure, record the latency so the dashboard shows the error
        elapsed_ms = round((time.monotonic() - request_start) * 1000)
        if user_id and elapsed_ms > 0:
            _fire_latency_record(user_id, "/api/v1/analyze", float(elapsed_ms), status_code=500)

        logger.error("analyze endpoint unhandled error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal analysis error")


def _fire_latency_record(user_id: str, endpoint: str, latency_ms: float, status_code: int = 200) -> None:
    """Fire-and-forget latency POST to connectors with strong task reference.

    Uses the same strong-reference pattern as ASGI middleware and HTTP
    interceptor to prevent GC from collecting the task before it runs.
    """
    connectors_url = _get_connectors_url()
    latency_url = f"{connectors_url}/internal/latency"

    async def _record():
        try:
            client = get_internal_client()
            resp = await client.post(
                latency_url,
                json={
                    "user_id": user_id,
                    "endpoint": endpoint,
                    "latency_ms": latency_ms,
                    "status_code": status_code,
                },
            )
            if resp.status_code >= 400:
                logger.warning(
                    "latency_record_failed status=%d user=%s endpoint=%s ms=%.1f",
                    resp.status_code, user_id, endpoint, latency_ms,
                )
            else:
                logger.debug(
                    "latency_recorded user=%s endpoint=%s ms=%.1f",
                    user_id, endpoint, latency_ms,
                )
        except Exception as exc:
            logger.warning(
                "latency_record_error user=%s endpoint=%s ms=%.1f error=%s",
                user_id, endpoint, latency_ms, exc,
            )

    task = asyncio.create_task(_record())
    _LATENCY_TASKS.add(task)
    task.add_done_callback(_LATENCY_TASKS.discard)


# ── Health and metadata endpoints ─────────────────────────────────────────────

@router.get(
    "/pillars",
    summary="List all trust pillars and their weights",
)
async def list_pillars() -> dict:
    return {
        "pillars": [
            {"id": "safety",          "name": "Safety & Toxicity",    "weight": 0.25},
            {"id": "hallucination",   "name": "Hallucination",         "weight": 0.25},
            {"id": "bias",            "name": "Bias & Fairness",       "weight": 0.20},
            {"id": "prompt_security", "name": "Prompt Security",       "weight": 0.15},
            {"id": "compliance",      "name": "Compliance & PII",      "weight": 0.15},
        ]
    }


@router.get(
    "/health",
    summary="SDK and NIM connectivity health check",
)
async def health(sdk: VeldrixSDK = Depends(get_sdk)) -> dict:
    return {
        "status":      "ok",
        "sdk_version": sdk.VERSION,
        "nim_base_url": "configured",
    }


@router.get(
    "/health/providers",
    summary="Multi-provider inference health and circuit-breaker state",
)
async def health_providers() -> dict:
    from src.inference.providers import get_active_providers
    from src.inference import circuit_breaker

    _ALL_KNOWN = {"nvidia_nim", "groq", "bedrock", "oss_fallback"}
    active_names = {p.name for p in get_active_providers()}

    circuit_states: dict[str, str] = {}
    for name in _ALL_KNOWN:
        if name in active_names:
            circuit_states[name] = circuit_breaker._get_circuit(name).state.value
        else:
            circuit_states[name] = "excluded"

    closed_count = sum(
        1 for name in active_names
        if circuit_breaker._get_circuit(name).state.value == "CLOSED"
    )

    if closed_count >= 2:
        status = "healthy"
    elif closed_count == 1:
        status = "degraded"
    else:
        status = "critical"

    evaluation_capable = any(
        circuit_breaker.is_available(name) for name in active_names
    )

    from datetime import datetime, timezone
    return {
        "status": status,
        "active_providers": sorted(active_names),
        "circuit_states": circuit_states,
        "evaluation_capability": evaluation_capable,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.get(
    "/health/circuit-breaker",
    summary="Distributed circuit breaker state across all providers",
)
async def health_circuit_breaker() -> dict:
    from src.inference.providers import get_active_providers
    from src.inference import circuit_breaker as cb
    from src.config import get_settings
    from datetime import datetime, timezone

    settings = get_settings()
    active_names = {p.name for p in get_active_providers()}
    _ALL = {"nvidia_nim", "groq", "bedrock", "oss_fallback"}

    live_states = await cb.async_get_all_states()
    provider_states: dict[str, str] = {}
    for name in _ALL:
        provider_states[name] = live_states.get(name, "CLOSED") if name in active_names else "excluded"

    redis_fallback = False
    if cb._redis_backend is not None:
        redis_fallback = cb._redis_backend._fallback_mode

    return {
        "backend": settings.CIRCUIT_BREAKER_BACKEND,
        "redis_fallback_active": redis_fallback,
        "providers": provider_states,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
