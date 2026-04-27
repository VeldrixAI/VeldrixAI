"""
VeldrixAI SDK — Five-Pillar dispatcher.

Delegates to the existing battle-tested pillar implementations in
src.pillars.implementations.ai_safety_pillars (NIM API, retry logic,
regex fast-paths, exponential backoff).  This module converts between
the internal 0–100 PillarResult domain type and the SDK 0.0–1.0
PillarResult schema — no NIM logic is duplicated here.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import httpx  # kept in signature for API compatibility with VeldrixSDK

from src.domain.types import TrustEvaluationInput, TrustEvaluationContext
from src.pillars.implementations.ai_safety_pillars import (
    SafetyToxicityPillar,
    HallucinationPillar,
    BiasFairnessPillar,
    PromptSecurityPillar,
    CompliancePolicyPillar,
)
from src.pillars.types import PillarStatus as LegacyStatus
from src.sdk.models import AnalysisRequest, PillarResult, PillarStatus
from src.utils.request import generate_request_id

logger = logging.getLogger("veldrix.pillars")

# Mapping from internal pillar IDs to SDK pillar IDs
_ID_MAP: dict[str, str] = {
    "safety_toxicity":  "safety",
    "hallucination":    "hallucination",
    "bias_fairness":    "bias",
    "prompt_security":  "prompt_security",
    "compliance_policy": "compliance",
}


def _to_input(request: AnalysisRequest) -> TrustEvaluationInput:
    return TrustEvaluationInput(
        prompt=request.prompt,
        response=request.response,
        model="sdk",
        context={"policy_context": request.context or ""},
        metadata=None,
    )


def _to_context() -> TrustEvaluationContext:
    return TrustEvaluationContext(request_id=generate_request_id())


def _convert(legacy, sdk_pillar_id: str) -> PillarResult:
    """Convert an internal PillarResult (0–100) to SDK PillarResult (0.0–1.0)."""
    if legacy.status in (LegacyStatus.SUCCESS, LegacyStatus.PARTIAL):
        status = PillarStatus.OK
    elif legacy.status == LegacyStatus.SKIPPED:
        status = PillarStatus.SKIP
    else:
        status = PillarStatus.ERROR

    score      = legacy.score.value / 100.0 if legacy.score else None
    confidence = legacy.score.confidence    if legacy.score else None
    error_msg  = legacy.error.message       if legacy.error else None

    return PillarResult(
        pillar=sdk_pillar_id,
        status=status,
        score=round(score, 4) if score is not None else None,
        confidence=round(confidence, 4) if confidence is not None else None,
        flags=list(legacy.flags or []),
        raw_labels=dict(legacy.details or {}),
        error=error_msg,
        latency_ms=int(legacy.execution_time_ms) if legacy.execution_time_ms is not None else None,
    )


def _error_result(sdk_id: str, exc: Exception, t0: float) -> PillarResult:
    logger.error("[%s] pillar failed: %s", sdk_id, exc)
    return PillarResult(
        pillar=sdk_id,
        status=PillarStatus.ERROR,
        score=None,
        error=str(exc),
        latency_ms=int((time.monotonic() - t0) * 1000),
    )


# ── Module-level pillar singletons ────────────────────────────────────────────
# Pillar classes are stateless — all evaluation state is request-scoped.
# Reusing a single instance per pillar avoids object creation overhead on
# every call and removes the cost of re-running @property metadata lookups.
_SAFETY_PILLAR          = SafetyToxicityPillar()
_HALLUCINATION_PILLAR   = HallucinationPillar()
_BIAS_PILLAR            = BiasFairnessPillar()
_PROMPT_SECURITY_PILLAR = PromptSecurityPillar()
_COMPLIANCE_PILLAR      = CompliancePolicyPillar()


# ── Five public async functions (one per pillar) ─────────────────────────────
# Each is async and returns a PillarResult.  The http parameter is accepted for
# API compatibility with VeldrixSDK but is unused — existing pillar classes
# own their own NIMClientRegistry singleton.

async def run_safety(request: AnalysisRequest, http: Optional[httpx.AsyncClient] = None) -> PillarResult:
    t0 = time.monotonic()
    try:
        result = await _SAFETY_PILLAR.evaluate(_to_input(request), _to_context())
        return _convert(result, "safety")
    except Exception as exc:
        return _error_result("safety", exc, t0)


async def run_hallucination(request: AnalysisRequest, http: Optional[httpx.AsyncClient] = None) -> PillarResult:
    t0 = time.monotonic()
    try:
        result = await _HALLUCINATION_PILLAR.evaluate(_to_input(request), _to_context())
        return _convert(result, "hallucination")
    except Exception as exc:
        return _error_result("hallucination", exc, t0)


async def run_bias(request: AnalysisRequest, http: Optional[httpx.AsyncClient] = None) -> PillarResult:
    t0 = time.monotonic()
    try:
        result = await _BIAS_PILLAR.evaluate(_to_input(request), _to_context())
        return _convert(result, "bias")
    except Exception as exc:
        return _error_result("bias", exc, t0)


async def run_prompt_security(request: AnalysisRequest, http: Optional[httpx.AsyncClient] = None) -> PillarResult:
    t0 = time.monotonic()
    try:
        result = await _PROMPT_SECURITY_PILLAR.evaluate(_to_input(request), _to_context())
        return _convert(result, "prompt_security")
    except Exception as exc:
        return _error_result("prompt_security", exc, t0)


async def run_compliance(request: AnalysisRequest, http: Optional[httpx.AsyncClient] = None) -> PillarResult:
    t0 = time.monotonic()
    try:
        result = await _COMPLIANCE_PILLAR.evaluate(_to_input(request), _to_context())
        return _convert(result, "compliance")
    except Exception as exc:
        return _error_result("compliance", exc, t0)
