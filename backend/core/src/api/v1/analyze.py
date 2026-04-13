"""
POST /api/v1/analyze — VeldrixAI trust analysis endpoint.

Single entry point for all trust evaluations.  Runs all five pillars in
parallel and returns a unified AnalysisResult with per-pillar breakdown.

Latency governor:
  LatencyBudgetMiddleware attaches a LatencyBudget to request.state before
  this handler runs.  The budget carries the SLA tier and per-pillar slot
  allocations.  When background=True the evaluation is queued via
  BackgroundEvaluationWorker and this handler returns in <10 ms.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.v1.dependencies import get_sdk, require_api_key
from src.sdk.client import VeldrixSDK
from src.sdk.models import AnalysisRequest, AnalysisResult

router = APIRouter(prefix="/api/v1", tags=["Analysis"])
logger = logging.getLogger("veldrix.api")


@router.post(
    "/analyze",
    response_model=None,  # returns AnalysisResult OR dict for background mode
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
    sdk:     VeldrixSDK = Depends(get_sdk),
    caller:  dict       = Depends(require_api_key),
):
    # ── Read budget from middleware (may be absent if middleware not mounted) ──
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
            user_id=caller.get("user_id"),
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
        return await sdk.analyze(
            payload,
            user_id=caller.get("user_id"),
            actor_email=caller.get("email"),
            budget=budget,
            collector=collector,
            request_id=getattr(http_request.state, "request_id", None),
        )
    except Exception as exc:
        logger.error("analyze endpoint unhandled error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal analysis error")


@router.get(
    "/pillars",
    summary="List all trust pillars and their weights",
)
async def list_pillars() -> dict:
    return {
        "pillars": [
            {"id": "safety",          "name": "Safety & Toxicity",    "weight": 0.25},
            {"id": "hallucination",   "name": "Hallucination",         "weight": 0.20},
            {"id": "bias",            "name": "Bias & Fairness",       "weight": 0.15},
            {"id": "prompt_security", "name": "Prompt Security",       "weight": 0.25},
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
    description=(
        "Returns the reliability posture of all configured inference providers. "
        "Public endpoint — no authentication required. "
        "Suitable for uptime monitors and status page integrations."
    ),
)
async def health_providers() -> dict:
    """
    GET /api/v1/health/providers

    Response shape:
      {
        "status": "healthy" | "degraded" | "critical",
        "active_providers": ["nvidia_nim", "groq"],
        "circuit_states": {
          "nvidia_nim": "CLOSED",
          "groq":       "CLOSED",
          "bedrock":    "excluded",
          "oss_fallback": "excluded"
        },
        "evaluation_capability": true,
        "timestamp": "2026-03-25T10:00:00Z"
      }

    status:
      healthy  — ≥2 providers CLOSED
      degraded — exactly 1 provider CLOSED
      critical — 0 providers CLOSED
    """
    from src.inference.providers import get_active_providers, PROVIDER_REGISTRY  # noqa: PLC0415
    from src.inference import circuit_breaker                                     # noqa: PLC0415

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

    return {
        "status": status,
        "active_providers": sorted(active_names),
        "circuit_states": circuit_states,
        "evaluation_capability": evaluation_capable,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
