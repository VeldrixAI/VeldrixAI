"""
POST /api/v1/analyze — VeldrixAI trust analysis endpoint.

Single entry point for all trust evaluations.  Runs all five pillars in
parallel and returns a unified AnalysisResult with per-pillar breakdown.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.api.v1.dependencies import get_sdk, require_api_key
from src.sdk.client import VeldrixSDK
from src.sdk.models import AnalysisRequest, AnalysisResult

router = APIRouter(prefix="/api/v1", tags=["Analysis"])
logger = logging.getLogger("veldrix.api")


@router.post(
    "/analyze",
    response_model=AnalysisResult,
    summary="Run full five-pillar trust analysis",
    description=(
        "Submits a prompt+response pair through all five VeldrixAI trust pillars "
        "(Safety, Hallucination, Bias, Prompt Security, Compliance) in parallel "
        "and returns a unified TrustScore with per-pillar breakdown."
    ),
)
async def analyze(
    request: AnalysisRequest,
    sdk:     VeldrixSDK = Depends(get_sdk),
    caller:  dict       = Depends(require_api_key),
) -> AnalysisResult:
    try:
        return await sdk.analyze(request, user_id=caller.get("user_id"))
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
