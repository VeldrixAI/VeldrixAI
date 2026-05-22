"""
VeldrixAI SDK — Production Client
Orchestrates all five trust pillars via asyncio.wait() with a hard total-budget
timeout and per-pillar slot timeouts.  Always applies timeouts — never falls
back to an unbounded path.  Every pillar error is captured and surfaced as
PillarStatus.ERROR so the request always completes.

Latency architecture (v2.0):
  - HARD total-budget timeout on the entire dispatch (asyncio.wait with timeout).
    If the budget is exceeded, ALL in-flight pillars are cancelled immediately
    and degraded results are returned.
  - Per-pillar slot timeouts via asyncio.wait_for inside the pillar runner.
    Each pillar has max 250ms (STANDARD) or 40ms (REALTIME).
  - Even without a budget object, hardcoded defaults apply (STANDARD tier).
    There is NO unbounded execution path.
  - CancelledError and CancelledError-converted-by-wait_for are both handled.

Diagnostics:
  - LATENCY_PROFILE log at INFO for every evaluation with pillar breakdown
  - LATENCY_SLA_BREACH warning when ANY pillar exceeds 250ms
  - TOTAL_BUDGET_TIMEOUT warning when the hard budget fires
  - structured timing stages in the result for debug mode
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
import src.sdk.pillars as _pillars
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

# Ordered list matching execution order
_PILLAR_NAMES = ["safety", "hallucination", "bias", "prompt_security", "compliance"]

# ── Hardcoded STANDARD defaults (used when no budget object is provided) ──────
# These match the STANDARD tier in latency_tiers.py.
_DEFAULT_TOTAL_BUDGET_MS = 500
_DEFAULT_SLOT_MS = 250
_PILLAR_SLA_MS = 250  # per-pillar SLA breach threshold


async def _run_pillar_with_slot(
    name: str,
    coro,
    slot_ms: int,
    collector: Optional["LatencyCollector"],
) -> PillarResult:
    """
    Run a single pillar coroutine with a hard asyncio timeout equal to slot_ms.
    Never raises — always returns a PillarResult.
    """
    effective_slot = max(slot_ms, 10)  # Guard against zero/negative timeouts
    start = time.perf_counter()
    try:
        result = await asyncio.wait_for(coro, timeout=effective_slot / 1000.0)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        if elapsed_ms > _PILLAR_SLA_MS:
            logger.warning(
                "LATENCY_SLA_BREACH pillar=%s ms=%d threshold=%d slot_ms=%d",
                name, elapsed_ms, _PILLAR_SLA_MS, slot_ms,
            )
        return result
    except asyncio.TimeoutError:
        # wait_for timed out — pillar consumed its full slot
        elapsed_ms = slot_ms
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=True)
        logger.warning(
            "veldrix.pillar.timeout pillar=%s slot_ms=%d", name, slot_ms,
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
        # Task was cancelled externally (total-budget timeout or shutdown)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.warning(
            "veldrix.pillar.cancelled pillar=%s elapsed_ms=%d",
            name, elapsed_ms,
        )
        return PillarResult(
            pillar=name,
            status=PillarStatus.ERROR,
            score=None,
            confidence=0.0,
            flags=["EVALUATION_CANCELLED"],
            error="Pillar evaluation was cancelled (total budget exceeded?)",
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


async def _dispatch_pillars(
    request: AnalysisRequest,
    http: httpx.AsyncClient | None,
    budget: Optional["LatencyBudget"],
    collector: Optional["LatencyCollector"],
) -> tuple[dict[str, PillarResult], dict[str, float]]:
    """
    Dispatch all five pillars with hard total-budget timeout.

    Uses asyncio.wait() with a timeout to enforce the absolute maximum
    wall-clock time.  Pillars that exceed the total budget are cancelled
    and return degraded results.

    Returns (pillar_results dict, stage_timings dict).
    """
    _t: dict[str, float] = {"start": time.monotonic()}

    # Determine slot values — use budget slots or defaults
    if budget and budget.pillar_slots:
        total_budget_ms = budget.total_budget_ms
        slots = budget.pillar_slots
    else:
        total_budget_ms = _DEFAULT_TOTAL_BUDGET_MS
        from src.config.latency_tiers import PillarSlots
        slots = PillarSlots(
            safety_ms=_DEFAULT_SLOT_MS,
            hallucination_ms=_DEFAULT_SLOT_MS,
            bias_ms=_DEFAULT_SLOT_MS,
            prompt_security_ms=_DEFAULT_SLOT_MS,
            compliance_ms=_DEFAULT_SLOT_MS,
        )

    total_budget_s = total_budget_ms / 1000.0

    # Build per-pillar coroutines with individual slot timeouts
    coros = [
        _run_pillar_with_slot("safety",          _pillars.run_safety(request, http),          slots.safety_ms,          collector),
        _run_pillar_with_slot("hallucination",   _pillars.run_hallucination(request, http),   slots.hallucination_ms,   collector),
        _run_pillar_with_slot("bias",            _pillars.run_bias(request, http),            slots.bias_ms,            collector),
        _run_pillar_with_slot("prompt_security", _pillars.run_prompt_security(request, http), slots.prompt_security_ms, collector),
        _run_pillar_with_slot("compliance",      _pillars.run_compliance(request, http),      slots.compliance_ms,      collector),
    ]
    # Map coroutines to pillar names for result processing
    tasks = {name: asyncio.ensure_future(coro) for name, coro in zip(_PILLAR_NAMES, coros)}

    _t["dispatch_start"] = time.monotonic()

    # ── HARD TOTAL-BUDGET TIMEOUT ──────────────────────────────────────────
    # Use asyncio.wait with timeout.  When the timer fires, ANY task that
    # hasn't completed yet is cancelled immediately by asyncio itself.
    done_tasks, pending_tasks = await asyncio.wait(
        list(tasks.values()),
        timeout=total_budget_s,
        return_when=asyncio.FIRST_EXCEPTION,
    )

    _t["dispatch_end"] = time.monotonic()
    dispatch_elapsed = (_t["dispatch_end"] - _t["dispatch_start"]) * 1000

    # Cancel any pending (timed-out) tasks immediately
    if pending_tasks:
        logger.warning(
            "TOTAL_BUDGET_TIMEOUT timeout_ms=%.0f elapsed_ms=%.1f pending=%d",
            total_budget_ms, dispatch_elapsed, len(pending_tasks),
        )
        for task in pending_tasks:
            task.cancel()
        # Await the cancelled tasks so they finish (graceful cancellation)
        if pending_tasks:
            await asyncio.wait(pending_tasks, timeout=0.5)

    # Collect results
    pillar_results: dict[str, PillarResult] = {}
    for name, task in tasks.items():
        if task in done_tasks:
            try:
                result = task.result()
                pillar_results[name] = result
            except Exception as exc:
                # Should not happen (pillar runners never raise), but guard
                logger.error("veldrix.pillar.unexpected pillar=%s: %s", name, exc)
                pillar_results[name] = PillarResult(
                    pillar=name, status=PillarStatus.ERROR,
                    score=None, error=str(exc)[:200],
                )
        else:
            # Task was cancelled — should not happen since we waited above,
            # but handle defensively
            pillar_results[name] = PillarResult(
                pillar=name, status=PillarStatus.ERROR,
                score=None, flags=["EVALUATION_TIMEOUT"],
                error=f"Total budget of {total_budget_ms}ms exceeded",
                latency_ms=0,
            )

    _t["dispatch_end"] = time.monotonic()
    return pillar_results, _t


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

        Always applies a hard total-budget timeout, even when no budget object
        is provided (uses STANDARD defaults: 500ms total, 250ms per pillar).
        """
        if request_id is None:
            request_id = str(uuid.uuid4())
        started_at = time.monotonic()
        budget_tier = budget.tier if budget else "STANDARD"

        logger.info(
            "veldrix.analyze.start request_id=%s prompt_len=%d tier=%s",
            request_id, len(request.prompt), budget_tier,
        )

        # ── Execute all pillars with hard timeout ──────────────────────────────
        # _dispatch_pillars always applies timeouts — never unbounded.
        pillar_results, _t = await _dispatch_pillars(request, self._http, budget, collector)

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
        dispatch_ms = round(
            (_t.get("dispatch_end", time.monotonic()) -
             _t.get("dispatch_start", _t.get("start", started_at))) * 1000
        )
        enforcement_ms = round(
            (_t.get("enforcement_end", time.monotonic()) -
             _t.get("enforcement_start", _t.get("start", started_at))) * 1000
        )
        timings = {
            "pillar_dispatch_ms":  dispatch_ms,
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

        # Audit write is fire-and-forget
        asyncio.create_task(self._telemetry.record(
            result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:200] if request.response else None,
            user_id=user_id,
            actor_email=actor_email,
        ))

        # ── Structured latency diagnostics ────────────────────────────────────
        logger.info(
            "LATENCY_PROFILE request_id=%s total_ms=%d tier=%s dispatch_ms=%d pillars=%s",
            request_id, elapsed_ms, budget_tier, dispatch_ms,
            {k: f"{v}ms" for k, v in per_pillar_ms.items()},
        )
        for _pillar, _ms in per_pillar_ms.items():
            if _ms > _PILLAR_SLA_MS:
                logger.warning(
                    "LATENCY_SLA_BREACH pillar=%s ms=%d threshold=%d tier=%s",
                    _pillar, _ms, _PILLAR_SLA_MS, budget_tier,
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
    """Weighted aggregation of pillar scores into a single TrustScore."""
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
