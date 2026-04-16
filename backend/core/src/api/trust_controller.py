"""AI Safety API controller."""

import logging
import os
import httpx
from datetime import datetime
from fastapi import APIRouter, Depends, status
from src.sdk.telemetry import SDKTelemetry


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

CONNECTORS_URL = os.getenv("CONNECTORS_URL", "http://localhost:8002")


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

<<<<<<< Updated upstream
=======
    # Record to audit trail via telemetry
    try:
        telemetry = SDKTelemetry()
        
        # Convert pillar scores to 0-1 range and map to SDK format
        pillar_scores_dict = {}
        all_flags = []
        critical_flags = []
        
        for pillar_id, result in report.pillar_results.items():
            mapped_id = _PILLAR_ID_MAP.get(pillar_id, pillar_id)
            if result.score:
                pillar_scores_dict[mapped_id] = result.score.value / 100.0
            if result.flags:
                all_flags.extend(result.flags)
                if pillar_id in ("safety_toxicity", "prompt_security"):
                    critical_flags.extend(result.flags)
        
        # Map risk level to verdict
        risk_level = report.final_score.risk_level.value if report.final_score.risk_level else "safe"
        verdict_map = {
            "safe": "ALLOW", "low": "ALLOW",
            "review_required": "REVIEW", "medium": "REVIEW",
            "high_risk": "WARN", "high": "WARN",
            "critical": "BLOCK"
        }
        verdict = verdict_map.get(risk_level, "REVIEW")
        
        # Create mock AnalysisResult for telemetry
        from types import SimpleNamespace
        mock_result = SimpleNamespace(
            request_id=report.request_id,
            trust_score=SimpleNamespace(
                overall=composite_trust_score,
                verdict=verdict,
                pillar_scores=pillar_scores_dict,
                critical_flags=critical_flags,
                all_flags=all_flags
            ),
            total_latency_ms=int(execution_time),
            sdk_version="1.0.0",
            timestamp=report.timestamp.timestamp() if hasattr(report.timestamp, 'timestamp') else report.timestamp,
            pillars={
                _PILLAR_ID_MAP.get(pid, pid): SimpleNamespace(
                    score=r.score.value / 100.0 if r.score else None,
                    status=r.status,
                    flags=r.flags or []
                )
                for pid, r in report.pillar_results.items()
            }
        )
        
        await telemetry.record(
            result=mock_result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:2000] if request.response else None,
            user_id=user_id,
            actor_email=None,
        )
        logger.info(f"Telemetry recorded for request_id={report.request_id}")
    except Exception as e:
        logger.error(f"Failed to record telemetry: {e}", exc_info=True)

    # Dispatch trust-violation notification (non-blocking, fire-and-forget)
    risk_level = report.final_score.risk_level.value if report.final_score.risk_level else "safe"
    if risk_level in ("critical", "high_risk"):
        _action = "blocked" if risk_level == "critical" else "flagged"
        _pillar = _worst_pillar(report.pillar_results)
        asyncio.create_task(dispatch_notification(
            user_id=user_id,
            audit_log_id=report.request_id,
            action=_action,
            pillar=_PILLAR_ID_MAP.get(_pillar, _pillar),
            endpoint=request.context or "/trust/evaluate",
            model_name=request.model,
        ))

>>>>>>> Stashed changes
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
