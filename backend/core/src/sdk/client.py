"""
VeldrixAI SDK — Production Client
Orchestrates all five trust pillars via asyncio.gather() and returns
a unified AnalysisResult.  Never raises — every pillar error is captured
and surfaced as PillarStatus.ERROR so the request always completes.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional

import httpx

from src.sdk.models import (
    AnalysisRequest,
    AnalysisResult,
    PillarResult,
    PillarStatus,
    TrustScore,
)
import src.sdk.pillars as _pillars  # module-ref so patch("src.sdk.pillars.run_*") works
from src.sdk.telemetry import SDKTelemetry

logger = logging.getLogger("veldrix.sdk")

# Pillar weights — safety and prompt_security carry highest governance risk
_WEIGHTS: dict[str, float] = {
    "safety":          0.25,
    "hallucination":   0.20,
    "bias":            0.15,
    "prompt_security": 0.25,
    "compliance":      0.15,
}


class VeldrixSDK:
    """
    Production-grade VeldrixAI SDK client.

    Usage:
        async with VeldrixSDK() as sdk:
            result = await sdk.analyze(AnalysisRequest(prompt=..., response=...))
    """

    VERSION = "1.0.0"

    def __init__(self, http_client: Optional[httpx.AsyncClient] = None):
        # http_client is accepted for API compatibility and passed to pillar
        # functions, but pillar implementations use NIMClientRegistry internally.
        self._http      = http_client
        self._telemetry = SDKTelemetry()

    async def analyze(self, request: AnalysisRequest, user_id: str | None = None, user_timezone: str = "UTC") -> AnalysisResult:
        """
        Run all five trust pillars in parallel and return a unified AnalysisResult.
        Never raises — all pillar errors are captured as PillarStatus.ERROR.
        """
        request_id = str(uuid.uuid4())
        started_at = time.monotonic()

        logger.info(
            "veldrix.analyze.start",
            extra={"request_id": request_id, "prompt_len": len(request.prompt)},
        )

        # ── Run all five pillars concurrently ─────────────────────────────────
        raw_results = await asyncio.gather(
            _pillars.run_safety(request, self._http),
            _pillars.run_hallucination(request, self._http),
            _pillars.run_bias(request, self._http),
            _pillars.run_prompt_security(request, self._http),
            _pillars.run_compliance(request, self._http),
            return_exceptions=True,
        )

        pillar_names = ["safety", "hallucination", "bias", "prompt_security", "compliance"]
        pillar_results: dict[str, PillarResult] = {}

        for name, raw in zip(pillar_names, raw_results):
            if isinstance(raw, Exception):
                logger.error(
                    "veldrix.pillar.error",
                    extra={"pillar": name, "error": str(raw), "request_id": request_id},
                )
                pillar_results[name] = PillarResult(
                    pillar=name,
                    status=PillarStatus.ERROR,
                    score=None,
                    error=str(raw),
                    latency_ms=None,
                )
            else:
                pillar_results[name] = raw

        # ── Aggregate TrustScore ──────────────────────────────────────────────
        trust_score = _aggregate_trust_score(pillar_results)
        elapsed_ms  = round((time.monotonic() - started_at) * 1000)

        result = AnalysisResult(
            request_id=request_id,
            trust_score=trust_score,
            pillars=pillar_results,
            total_latency_ms=elapsed_ms,
            sdk_version=self.VERSION,
        )

        await self._telemetry.record(
            result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:200] if request.response else None,
            user_id=user_id,
            user_timezone=request.user_timezone or user_timezone,
        )

        logger.info(
            "veldrix.analyze.complete",
            extra={
                "request_id":   request_id,
                "trust_score":  trust_score.overall,
                "verdict":      trust_score.verdict,
                "latency_ms":   elapsed_ms,
            },
        )

        return result

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()

    async def __aenter__(self) -> "VeldrixSDK":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()


def _aggregate_trust_score(pillars: dict[str, PillarResult]) -> TrustScore:
    """
    Weighted aggregation of pillar scores into a single TrustScore.
    Safety and prompt_security carry highest governance weight.
    """
    weighted_sum    = 0.0
    total_weight    = 0.0
    critical_flags: list[str] = []
    all_flags:      list[str] = []

    for name, result in pillars.items():
        if result.status == PillarStatus.OK and result.score is not None:
            w             = _WEIGHTS.get(name, 0.20)
            weighted_sum += result.score * w
            total_weight += w
        if result.flags:
            all_flags.extend(result.flags)
            if name in ("safety", "prompt_security"):
                critical_flags.extend(result.flags)

    overall = round(weighted_sum / total_weight, 4) if total_weight > 0 else 0.0

    # Verdict — business rule, not ML
    if overall >= 0.85 and not critical_flags:
        verdict = "ALLOW"
    elif overall >= 0.60 and not critical_flags:
        verdict = "WARN"
    elif critical_flags:
        verdict = "BLOCK"
    else:
        verdict = "REVIEW"

    return TrustScore(
        overall=overall,
        verdict=verdict,
        critical_flags=critical_flags,
        all_flags=all_flags,
        pillar_scores={
            name: r.score
            for name, r in pillars.items()
            if r.score is not None
        },
    )
