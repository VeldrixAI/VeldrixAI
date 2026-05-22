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

Diagnostics (v2.0):
  - LATENCY_PROFILE log at INFO for every evaluation with pillar breakdown
  - LATENCY_SLA_BREACH warning when ANY pillar exceeds 250ms (threshold
    calibrated for STANDARD tier 250ms slots)
  - structured timing stages in the result for debug mode
  - per-pillar timeout recovery with EVALUATION_TIMEOUT flag
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

# SLA breach threshold for individual pillars (250ms = STANDARD slot size)
_PILLAR_SLA_MS = 250


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

    If slot_ms <= 0, uses a minimum of 10ms guard so asyncio.wait_for does not
    immediately cancel the coroutine with a non-positive timeout.
    """
    effective_slot = max(slot_ms, 10)
    start = time.perf_counter()
    try:
        result = await asyncio.wait_for(coro, timeout=effective_slot / 1000.0)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        # Log SLA breach warning when pillar exceeds the 250ms threshold
        if elapsed_ms > _PILLAR_SLA_MS:
            logger.warning(
                "LATENCY_SLA_BREACH pillar=%s ms=%d threshold=%d slot_ms=%d",
                name, elapsed_ms, _PILLAR_SLA_MS, slot_ms,
            )
        return result
    except asyncio.TimeoutError:
        elapsed_ms = slot_ms  # consumed the full slot
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=True)
        logger.warning(
            "veldrix.pillar.timeout pillar=%s slot_ms=%d elapsed_budget=%d",
            name, slot_ms, elapsed_ms,
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
    except asyncio.CancelledError:
        # Event loop is shutting down — return degraded result without re-raising
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.error(
            "veldrix.pillar.cancelled pillar=%s elapsed_ms=%d",
            name, elapsed_ms,
        )
        return PillarResult(
            pillar=name,
            status=PillarStatus.ERROR,
            score=None,
            confidence=0.0,
            flags=["EVALUATION_CANCELLED"],
            error="Pillar evaluation was cancelled (event loop shutdown?)",
            latency_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        logger.error(
            "veldrix.pillar.error pillar=%s error=%s elapsed_ms=%d",
            name, exc, elapsed_ms,
        )
        return PillarResult(
            pillar=name,
            status=PillarStatus.ERROR,
            score=None,
            confidence=0.0,
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
        emit_diagnostics: bool = False,
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

        budget_tier = budget.tier if budget else "STANDARD"
        logger.info(
            "veldrix.analyze.start request_id=%s prompt_len=%d tier=%s",
            request_id, len(request.prompt), budget_tier,
        )

        slots = budget.pillar_slots if budget else None

        # ── Stage timings ──────────────────────────────────────────────────────
        _t = {"start": time.monotonic()}

        # ── Build per-pillar coroutines ────────────────────────────────────────
        if slots:
            coros = [
                _run_pillar_with_slot("safety",          _pillars.run_safety(request, self._http),          slots.safety_ms,          collector),
                _run_pillar_with_slot("hallucination",   _pillars.run_hallucination(request, self._http),   slots.hallucination_ms,   collector),
                _run_pillar_with_slot("bias",            _pillars.run_bias(request, self._http),            slots.bias_ms,            collector),
                _run_pillar_with_slot("prompt_security", _pillars.run_prompt_security(request, self._http), slots.prompt_security_ms, collector),
                _run_pillar_with_slot("compliance",      _pillars.run_compliance(request, self._http),      slots.compliance_ms,      collector),
            ]
            _t["pillar_dispatch_start"] = time.monotonic()
            # Hard total-budget timeout: even if individual pillars don't
            # cancel cleanly (e.g. deep cancellation chains in route_inference),
            # the entire dispatch is bounded by total_budget_ms.  If the
            # timeout fires, the gather raises TimeoutError and we return
            # degraded results for the pillars that didn't finish.
            #
            # Coroutines that were in-flight at the timeout are cancelled
            # by asyncio.gather (since return_exceptions=False).
            _total_timeout = budget.total_budget_ms / 1000.0 if budget else 0.5
            try:
                raw_results = await asyncio.wait_for(
                    asyncio.gather(*coros, return_exceptions=False),
                    timeout=_total_timeout,
                )
            except asyncio.TimeoutError:
                # Total budget exhausted — pillars that didn't finish are degraded
                elapsed_ms = int((time.perf_counter() - _t["pillar_dispatch_start"]) * 1000)
                logger.warning(
                    "TOTAL_BUDGET_TIMEOUT request_id=%s total_budget_ms=%.0f elapsed_ms=%d",
                    request_id, _total_timeout * 1000, elapsed_ms,
                )
                # Build partial results: completed pillars return normally,
                # uncompleted ones get a degraded PillarResult.
                raw_results = []
                for pname in _PILLAR_NAMES:
                    # All pillars end up timed out since the gather was cancelled
                    raw_results.append(PillarResult(
                        pillar=pname,
                        status=PillarStatus.ERROR,
                        score=None,
                        confidence=0.0,
                        flags=["EVALUATION_TIMEOUT"],
                        error=f"Total budget of {budget.total_budget_ms}ms exceeded",
                        latency_ms=0,
                    ))
            _t["pillar_dispatch_end"] = time.monotonic()
        else:
            # Legacy path — no budget, no per-pillar timeouts
            _t["pillar_dispatch_start"] = time.monotonic()
            raw_results = await asyncio.gather(
                _pillars.run_safety(request, self._http),
                _pillars.run_hallucination(request, self._http),
                _pillars.run_bias(request, self._http),
                _pillars.run_prompt_security(request, self._http),
                _pillars.run_compliance(request, self._http),
                return_exceptions=True,
            )
            _t["pillar_dispatch_end"] = time.monotonic()

        pillar_results: dict[str, PillarResult] = {}

        for name, raw in zip(_PILLAR_NAMES, raw_results):
            if isinstance(raw, Exception):
                # Only reachable on the legacy path (return_exceptions=True)
                logger.error(
                    "veldrix.pillar.error pillar=%s error=%s request_id=%s",
                    name, raw, request_id,
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
        _t["enforcement_start"] = time.monotonic()
        trust_score = _aggregate_trust_score(pillar_results)
        _t["enforcement_end"] = time.monotonic()
        elapsed_ms  = round((time.monotonic() - started_at) * 1000)

        # ── Build degradation metadata ────────────────────────────────────────
        timed_out_pillars = [
            r.pillar for r in pillar_results.values()
            if r.flags and "EVALUATION_TIMEOUT" in r.flags
        ]
        per_pillar_ms: dict[str, int] = {
            name: (r.latency_ms or 0) for name, r in pillar_results.items()
        }

        # ── Build structured timings ──────────────────────────────────────────
        pillar_dispatch_ms = round(
            (_t.get("pillar_dispatch_end", time.monotonic()) -
             _t.get("pillar_dispatch_start", _t["start"])) * 1000
        )
        enforcement_ms = round(
            (_t.get("enforcement_end", time.monotonic()) -
             _t.get("enforcement_start", _t["start"])) * 1000
        )
        timings = {
            "pillar_dispatch_ms":  pillar_dispatch_ms,
            "enforcement_ms":      enforcement_ms,
            "response_assembly_ms": 0,
            "audit_enqueue_ms":    0,
            "total_ms":            elapsed_ms,
            "per_pillar_ms":       per_pillar_ms,
            "budget_tier":         budget_tier,
        }

        _t["assembly_start"] = time.monotonic()
        result = AnalysisResult(
            request_id=request_id,
            trust_score=trust_score,
            pillars=pillar_results,
            total_latency_ms=elapsed_ms,
            sdk_version=self.VERSION,
            budget_tier=budget_tier,
            degraded=len(timed_out_pillars) > 0,
            pillars_timed_out=timed_out_pillars,
            per_pillar_ms=per_pillar_ms,
            timings_ms=timings if emit_diagnostics else None,
        )
        timings["response_assembly_ms"] = round(
            (time.monotonic() - _t["assembly_start"]) * 1000
        )

        # Audit write is fire-and-forget — response is returned immediately.
        asyncio.create_task(self._telemetry.record(
            result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:200] if request.response else None,
            user_id=user_id,
            actor_email=actor_email,
        ))

        # ── Structured latency diagnostics ────────────────────────────────────
        logger.info(
            "LATENCY_PROFILE request_id=%s total_ms=%d tier=%s pillars=%s",
            request_id, elapsed_ms, budget_tier,
            {k: f"{v}ms" for k, v in per_pillar_ms.items()},
        )
        for _pillar, _ms in per_pillar_ms.items():
            if _ms > _PILLAR_SLA_MS:
                logger.warning(
                    "LATENCY_SLA_BREACH pillar=%s ms=%d threshold=%d tier=%s",
                    _pillar, _ms, _PILLAR_SLA_MS, budget_tier,
                )

        # Log trailing diagnostics about the dispatch vs slot ratio
        if slots and pillar_dispatch_ms > 0:
            max_slot = max(
                slots.safety_ms, slots.hallucination_ms,
                slots.bias_ms, slots.prompt_security_ms, slots.compliance_ms,
            )
            logger.info(
                "LATENCY_SLOT report request_id=%s dispatch_ms=%d max_slot_ms=%d ratio=%.2f",
                request_id, pillar_dispatch_ms, max_slot,
                pillar_dispatch_ms / max_slot if max_slot > 0 else 0,
            )

        logger.info(
            "veldrix.analyze.complete request_id=%s trust_score=%.4f verdict=%s "
            "latency_ms=%d tier=%s degraded=%s timed_out=%s",
            request_id, trust_score.overall, trust_score.verdict,
            elapsed_ms, budget_tier, result.degraded, timed_out_pillars or [],
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
