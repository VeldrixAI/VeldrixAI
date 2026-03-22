"""Trust evaluation service layer."""

import hashlib
import logging
import time
from typing import Dict, Optional, Tuple

from src.domain.types import TrustEvaluationInput, TrustEvaluationContext, TrustReport
from src.orchestration.orchestration_engine import OrchestrationEngine
from src.orchestration.pillar_registry import get_registry
from src.pillars.implementations.ai_safety_pillars import (
    SafetyToxicityPillar,
    HallucinationPillar,
    BiasFairnessPillar,
    PromptSecurityPillar,
    CompliancePolicyPillar,
)
from src.utils.request import generate_request_id


logger = logging.getLogger(__name__)

# Initialize AI safety pillars on module load
_registry = get_registry()
if _registry.count() == 0:
    _registry.register(SafetyToxicityPillar())
    _registry.register(HallucinationPillar())
    _registry.register(BiasFairnessPillar())
    _registry.register(PromptSecurityPillar())
    _registry.register(CompliancePolicyPillar())
    logger.info(f"Registered {_registry.count()} AI safety pillars")

# ── In-process TTL cache ──────────────────────────────────────────────────────
# Keyed by SHA-256(prompt + response). Stores (TrustReport, inserted_at).
# 5-minute TTL; max 1000 entries (LRU-style eviction on overflow).
_CACHE_TTL_S: int = 300
_CACHE_MAX: int = 1000
_cache: Dict[str, Tuple[TrustReport, float]] = {}


def _cache_key(prompt: str, response: str) -> str:
    return hashlib.sha256(f"{prompt}\x00{response}".encode()).hexdigest()


def _cache_get(key: str) -> Optional[TrustReport]:
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[1]) < _CACHE_TTL_S:
        return entry[0]
    if entry:
        _cache.pop(key, None)  # expired
    return None


def _cache_set(key: str, report: TrustReport) -> None:
    if len(_cache) >= _CACHE_MAX:
        # evict oldest entry
        oldest = min(_cache, key=lambda k: _cache[k][1])
        _cache.pop(oldest, None)
    _cache[key] = (report, time.monotonic())


class TrustService:

    async def evaluate_trust(
        self,
        input_data: TrustEvaluationInput,
        user_id: str
    ) -> TrustReport:
        key = _cache_key(input_data.prompt, input_data.response)
        cached = _cache_get(key)
        if cached:
            logger.info("Cache hit for request — skipping NIM calls", extra={"request_id": cached.request_id})
            return cached

        request_id = generate_request_id()
        context = TrustEvaluationContext(
            request_id=request_id,
            metadata={"user_id": user_id}
        )

        logger.info(f"Evaluating AI output safety for {input_data.entity_id}", extra={
            "request_id": request_id,
            "entity_id": input_data.entity_id,
            "model": input_data.model,
            "user_id": user_id
        })

        engine = OrchestrationEngine(registry=_registry)
        report = await engine.evaluate(input_data, context)

        _cache_set(key, report)
        return report

