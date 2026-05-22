"""
POST /api/v1/analyze — VeldrixAI trust analysis endpoint.

Single entry point for all trust evaluations.  Runs all five pillars in
parallel and returns a unified AnalysisResult with per-pillar breakdown.

Latency governing:
  - LatencyBudgetMiddleware attaches a LatencyBudget to request.state
  - The SDK client always applies a hard total-budget timeout (500ms default)
  - Latency is recorded synchronously inside sdk.analyze() — every request
    creates exactly one row in request_latency (via connectors HTTP API)

  This file is a thin route handler.  All latency logic lives in client.py.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.v1.dependencies import get_sdk, require_api_key
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


@router.post(
    "/analyze",
    response_model=None,
    summary="Run full five-pillar trust analysis",
    description=(
        "Submits a prompt+response pair through all five VeldrixAI trust pillars "
        "(Safety, Hallucination, Bias, Prompt Security, Compliance) in parallel "
        "and returns a unified TrustScore with per-pillar breakdown.\n\n"
        "Latency is always bounded by a hard total-budget timeout (500ms default). "
        "Set `background: true` to return immediately."
    ),
)
async def analyze(
    payload: AnalysisRequest,
    http_request: Request,
    debug:   bool       = False,
    sdk:     VeldrixSDK = Depends(get_sdk),
    caller:  dict       = Depends(require_api_key),
):
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
    # Latency recording and timeout enforcement happen inside sdk.analyze().
    try:
        return await sdk.analyze(
            payload,
            user_id=user_id,
            actor_email=caller.get("email"),
            budget=budget,
            collector=collector,
            request_id=getattr(http_request.state, "request_id", None),
            emit_diagnostics=debug,
        )
    except Exception as exc:
        logger.error(
            "VELDRIX_ANALYZE_ERROR user=%s error=%s",
            user_id, exc, exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal analysis error")


# ── Health and metadata endpoints ─────────────────────────────────────────────

@router.get("/pillars", summary="List all trust pillars and their weights")
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


@router.get("/health", summary="SDK and NIM connectivity health check")
async def health(sdk: VeldrixSDK = Depends(get_sdk)) -> dict:
    return {"status": "ok", "sdk_version": sdk.VERSION, "nim_base_url": "configured"}


@router.get("/health/providers", summary="Multi-provider inference health and circuit-breaker state")
async def health_providers() -> dict:
    from src.inference.providers import get_active_providers
    from src.inference import circuit_breaker
    from datetime import datetime, timezone

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
    status = "healthy" if closed_count >= 2 else ("degraded" if closed_count == 1 else "critical")
    evaluation_capable = any(circuit_breaker.is_available(name) for name in active_names)

    return {
        "status": status,
        "active_providers": sorted(active_names),
        "circuit_states": circuit_states,
        "evaluation_capability": evaluation_capable,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.get("/health/circuit-breaker", summary="Distributed circuit breaker state across all providers")
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
