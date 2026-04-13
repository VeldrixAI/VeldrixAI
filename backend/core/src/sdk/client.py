"""
VeldrixAI SDK — Production Client
Orchestrates all five trust pillars via asyncio.gather() and returns
a unified AnalysisResult.  Never raises — every pillar error is captured
and surfaced as PillarStatus.ERROR so the request always completes.

Latency governor integration:
  Pass a LatencyBudget via the `budget` kwarg to apply per-pillar slot
  timeouts.  Without a budget the original unbounded behaviour is preserved
  (backward compatible).  Telemetry is emitted to the LatencyCollector
  singleton when one is supplied.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional, TYPE_CHECKING

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

if TYPE_CHECKING:
    from src.config.latency_tiers import LatencyBudget
    from src.telemetry.latency_collector import LatencyCollector

logger = logging.getLogger("veldrix.sdk")

# Pillar weights — safety and prompt_security carry highest governance risk
_WEIGHTS: dict[str, float] = {
    "safety":          0.25,
    "hallucination":   0.20,
    "bias":            0.15,
    "prompt_security": 0.25,
    "compliance":      0.15,
}

# Ordered list matching asyncio.gather() call order
_PILLAR_NAMES = ["safety", "hallucination", "bias", "prompt_security", "compliance"]


async def _run_pillar_with_slot(
    name: str,
    coro,
    slot_ms: int,
    collector: Optional["LatencyCollector"],
) -> PillarResult:
    """
    Run a single pillar coroutine with a hard asyncio timeout equal to slot_ms.

    On TimeoutError: returns a PillarResult with status=ERROR, score=None,
    and the EVALUATION_TIMEOUT flag.  The collector records the timed-out sample.
    Never raises — always returns a PillarResult.
    """
    start = time.perf_counter()
    timed_out = False
    try:
        result = await asyncio.wait_for(coro, timeout=slot_ms / 1000.0)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        return result
    except asyncio.TimeoutError:
        timed_out = True
        elapsed_ms = slot_ms  # consumed the full slot
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=True)
        logger.warning(
            "veldrix.pillar.timeout pillar=%s slot_ms=%d", name, slot_ms
        )
        return PillarResult(
            pillar=name,
            status=PillarStatus.ERROR,
            score=None,
            confidence=0.0,
            flags=["EVALUATION_TIMEOUT"],
            error=f"Pillar exceeded {slot_ms} ms slot",
            latency_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        logger.error(
            "veldrix.pillar.error pillar=%s error=%s", name, exc
        )
        return PillarResult(
            pillar=name,
            status=PillarStatus.ERROR,
            score=None,
            flags=["EVALUATION_ERROR"],
            error=str(exc)[:200],
            latency_ms=elapsed_ms,
        )


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

    async def analyze(
        self,
        request: AnalysisRequest,
        user_id: str | None = None,
        actor_email: str | None = None,
        budget: Optional["LatencyBudget"] = None,
        collector: Optional["LatencyCollector"] = None,
        request_id: Optional[str] = None,
    ) -> AnalysisResult:
        """
        Run all five trust pillars in parallel and return a unified AnalysisResult.
        Never raises — all pillar errors are captured as PillarStatus.ERROR.

        Args:
            budget:     When provided, each pillar runs under its per-slot timeout.
                        Without a budget, pillars run unbounded (original behaviour).
            collector:  LatencyCollector singleton — records per-pillar timing.
            request_id: Pre-generated ID (e.g. from LatencyBudgetMiddleware).
                        If not supplied, a new UUID is generated.
        """
        if request_id is None:
            request_id = str(uuid.uuid4())
        started_at = time.monotonic()

        logger.info(
            "veldrix.analyze.start",
            extra={
                "request_id": request_id,
                "prompt_len": len(request.prompt),
                "tier": budget.tier if budget else "unbounded",
            },
        )

        slots = budget.pillar_slots if budget else None

        # ── Build per-pillar coroutines ────────────────────────────────────────
        # If a budget is supplied, wrap each coroutine in _run_pillar_with_slot
        # so it has an independent asyncio timeout.  All five run concurrently
        # via gather — wall time ≈ max(slot_values), not sum(slot_values).
        if slots:
            coros = [
                _run_pillar_with_slot(
                    "safety",
                    _pillars.run_safety(request, self._http),
                    slots.safety_ms,
                    collector,
                ),
                _run_pillar_with_slot(
                    "hallucination",
                    _pillars.run_hallucination(request, self._http),
                    slots.hallucination_ms,
                    collector,
                ),
                _run_pillar_with_slot(
                    "bias",
                    _pillars.run_bias(request, self._http),
                    slots.bias_ms,
                    collector,
                ),
                _run_pillar_with_slot(
                    "prompt_security",
                    _pillars.run_prompt_security(request, self._http),
                    slots.prompt_security_ms,
                    collector,
                ),
                _run_pillar_with_slot(
                    "compliance",
                    _pillars.run_compliance(request, self._http),
                    slots.compliance_ms,
                    collector,
                ),
            ]
            # _run_pillar_with_slot never raises — return_exceptions=False is safe
            raw_results = await asyncio.gather(*coros, return_exceptions=False)
        else:
            # Legacy path — no budget, no per-pillar timeouts
            raw_results = await asyncio.gather(
                _pillars.run_safety(request, self._http),
                _pillars.run_hallucination(request, self._http),
                _pillars.run_bias(request, self._http),
                _pillars.run_prompt_security(request, self._http),
                _pillars.run_compliance(request, self._http),
                return_exceptions=True,
            )

        pillar_results: dict[str, PillarResult] = {}

        for name, raw in zip(_PILLAR_NAMES, raw_results):
            if isinstance(raw, Exception):
                # Only reachable on the legacy path (return_exceptions=True)
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

        # ── Build degradation metadata ────────────────────────────────────────
        timed_out_pillars = [
            r.pillar for r in pillar_results.values()
            if r.flags and "EVALUATION_TIMEOUT" in r.flags
        ]
        per_pillar_ms: dict[str, int] = {
            name: (r.latency_ms or 0) for name, r in pillar_results.items()
        }

        result = AnalysisResult(
            request_id=request_id,
            trust_score=trust_score,
            pillars=pillar_results,
            total_latency_ms=elapsed_ms,
            sdk_version=self.VERSION,
            budget_tier=budget.tier if budget else "STANDARD",
            degraded=len(timed_out_pillars) > 0,
            pillars_timed_out=timed_out_pillars,
            per_pillar_ms=per_pillar_ms,
        )

        await self._telemetry.record(
            result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:200] if request.response else None,
            user_id=user_id,
            actor_email=actor_email,
        )

        logger.info(
            "veldrix.analyze.complete",
            extra={
                "request_id":      request_id,
                "trust_score":     trust_score.overall,
                "verdict":         trust_score.verdict,
                "latency_ms":      elapsed_ms,
                "tier":            result.budget_tier,
                "degraded":        result.degraded,
                "timed_out":       timed_out_pillars,
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
