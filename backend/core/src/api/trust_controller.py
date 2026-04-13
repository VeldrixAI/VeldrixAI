"""AI Safety API controller."""

import asyncio
import logging
import os
import httpx
from datetime import datetime
from fastapi import APIRouter, Depends, status

from src.validators.schemas import (
    TrustEvaluationRequest,
    SuccessResponse,
    TrustReportResponse
)
from src.middlewares.auth import verify_jwt_token
from src.services.trust_service import TrustService, _cache_get, _cache_key
from src.domain.types import TrustEvaluationInput, AIOutputMetadata
from src.utils.request import Timer, set_request_id
from src.pillars.implementations.ai_safety_pillars import compute_composite_trust_score

CONNECTORS_URL = os.getenv("VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002"))

# Map internal pillar IDs (from PillarMetadata.id) to the frontend-expected keys
_PILLAR_ID_MAP = {
    "safety_toxicity": "safety",
    "hallucination": "hallucination",
    "bias_fairness": "bias",
    "prompt_security": "prompt_security",
    "compliance_policy": "compliance",
}


def _record_latency(user_id: str, latency_ms: float, status_code: int = 200):
    """Fire-and-forget latency record to connectors."""
    try:
        httpx.post(
            f"{CONNECTORS_URL}/internal/latency",
            json={"user_id": user_id, "endpoint": "/trust/evaluate", "latency_ms": latency_ms, "status_code": status_code},
            timeout=1.0,
        )
    except Exception:
        pass  # never block the response


async def _record_audit_trail(
    user_id: str,
    request_id: str,
    composite_score: float,
    report,
    prompt_preview: str | None = None,
    response_preview: str | None = None,
) -> None:
    """Persist trust evaluation to connectors audit trail (fire-and-forget)."""
    target_url = f"{CONNECTORS_URL}/api/audit-trails/internal/audit-trail"
    logger_at = logging.getLogger(__name__)
    try:
        # Map internal pillar IDs → frontend keys; normalize scores from 0-100 → 0-1
        pillar_scores = {}
        for pillar_id, result in report.pillar_results.items():
            key = _PILLAR_ID_MAP.get(pillar_id, pillar_id)
            pillar_scores[key] = round(result.score.value / 100.0, 4) if result.score is not None else None
        verdict = report.final_score.risk_level.value if report.final_score.risk_level else "unknown"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                target_url,
                json={
                    "action_type": "trust_evaluation",
                    "entity_type": "trust_evaluate",
                    "user_id": user_id,
                    "metadata": {
                        "request_id": request_id,
                        "overall_score": composite_score,
                        "verdict": verdict,
                        "pillar_scores": pillar_scores,
                        "total_latency_ms": report.execution_time_ms,
                        "prompt_preview": prompt_preview[:300] if prompt_preview else None,
                        "response_preview": response_preview[:300] if response_preview else None,
                    },
                },
            )
        logger_at.warning("audit_trail_record: saved request_id=%s status=%s", request_id, resp.status_code)
    except Exception as exc:
        logger_at.error("audit_trail_record failed request_id=%s url=%s: %s", request_id, target_url, exc)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trust", tags=["ai-safety"])


@router.post(
    "/evaluate",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate AI output safety",
    description="Evaluate AI-generated content for safety, compliance, and governance using Five-Pillar engine"
)
async def evaluate_trust(
    request: TrustEvaluationRequest,
    user_id: str = Depends(verify_jwt_token),
    trust_service: TrustService = Depends(lambda: TrustService())
) -> SuccessResponse:
    """
    Evaluate AI output safety.
    
    Args:
        request: AI output evaluation request (prompt, response, model)
        user_id: Authenticated user ID from JWT
        trust_service: Trust service instance
        
    Returns:
        SuccessResponse with SafetyReport data
    """
    timer = Timer().start()

    # Check cache before building input
    cache_hit = _cache_get(_cache_key(request.prompt, request.response)) is not None

    # Convert request to domain input
    input_data = TrustEvaluationInput(
        prompt=request.prompt,
        response=request.response,
        model=request.model,
        provider=request.provider,
        context=request.context,
        metadata=AIOutputMetadata(
            user_id=user_id,
            additional=request.metadata or {}
        )
    )
    
    # Evaluate trust
    report = await trust_service.evaluate_trust(input_data, user_id)
    set_request_id(report.request_id)
    
    execution_time = timer.stop()
    _record_latency(user_id, execution_time)

    logger.info(f"AI safety evaluation completed", extra={
        "request_id": report.request_id,
        "entity_id": report.entity_id,
        "model": input_data.model,
        "final_score": report.final_score.value,
        "execution_time_ms": execution_time
    })
    
    # Convert domain report to response
    response_data = TrustReportResponse(
        request_id=report.request_id,
        entity_id=report.entity_id,
        final_score={
            "value": report.final_score.value,
            "confidence": report.final_score.confidence,
            "risk_level": report.final_score.risk_level.value if report.final_score.risk_level else None
        },
        pillar_results={
            pillar_id: {
                "metadata": {
                    "id": result.metadata.id,
                    "name": result.metadata.name,
                    "version": result.metadata.version,
                    "weight": result.metadata.weight
                },
                "status": result.status.value,
                "score": {
                    "value": result.score.value,
                    "confidence": result.score.confidence,
                    "risk_level": result.score.risk_level.value if result.score.risk_level else None
                } if result.score else None,
                "execution_time_ms": result.execution_time_ms,
                "flags": result.flags,
                "error": {
                    "code": result.error.code,
                    "message": result.error.message,
                    "details": result.error.details
                } if result.error else None
            }
            for pillar_id, result in report.pillar_results.items()
        },
        timestamp=report.timestamp,
        execution_time_ms=report.execution_time_ms
    )
    
    # composite_trust_score: weighted average of NIM raw risk scores across all
    # pillars, normalised to [0.0, 1.0] where 1.0 = fully trusted.
    composite_trust_score = compute_composite_trust_score(report.pillar_results)
    logger.info(
        "composite_trust_score=%.4f for request_id=%s",
        composite_trust_score,
        report.request_id,
    )

    # Persist to audit trail (non-blocking)
    asyncio.create_task(_record_audit_trail(
        user_id, report.request_id, composite_trust_score, report,
        prompt_preview=request.prompt,
        response_preview=request.response,
    ))

    return SuccessResponse(
        data=response_data,
        metadata={
            "request_id": report.request_id,
            "timestamp": datetime.utcnow().isoformat(),
            "execution_time_ms": execution_time,
            "composite_trust_score": composite_trust_score,
            "cache_hit": cache_hit,
        }
    )
