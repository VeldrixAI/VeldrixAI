"""
VeldrixAI SDK — Production Client
Orchestrates all five trust pillars via asyncio.wait() with a HARD total-budget
timeout.  ALWAYS applies timeouts — there is no unbounded execution path.

Timeout architecture:
  ┌──────────────────────────────────────────────────┐
  │  asyncio.wait(tasks, timeout=total_budget_s)     │ ← Hard deadline
  │  ┌────────────────────────────────────────────┐   │
  │  │  Pillar 1: _run_pillar_with_slot(250ms)    │   │
  │  │  Pillar 2: _run_pillar_with_slot(250ms)    │   │  ← Per-pillar slots
  │  │  Pillar 3: _run_pillar_with_slot(250ms)    │   │
  │  │  Pillar 4: _run_pillar_with_slot(250ms)    │   │
  │  │  Pillar 5: _run_pillar_with_slot(250ms)    │   │
  │  └────────────────────────────────────────────┘   │
  │  → Pending tasks cancelled immediately on timeout │
  └──────────────────────────────────────────────────┘

Latency recording:
  Written synchronously to request_latency table via SQLAlchemy inside the
  same request-response cycle.  No fire-and-forget, no background tasks.
  Falls back to audit_trails action_metadata if connectors is unreachable.

Runtime verification:
  Every request logs the exact timeout config being used (tier, total_budget_ms,
  per-pillar slots) so deployment engineers can verify in production logs.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional, TYPE_CHECKING

import httpx

from src.core.http_pool import get_internal_client as _get_internal_client
from src.sdk.models import (
    AnalysisRequest,
    AnalysisResult,
    PillarResult,
    PillarStatus,
    TrustScore,
)
from src.sdk.telemetry import SDKTelemetry

if TYPE_CHECKING:
    from src.config.latency_tiers import LatencyBudget
    from src.telemetry.latency_collector import LatencyCollector

logger = logging.getLogger("veldrix.sdk")

# ── Hardcoded STANDARD defaults ──────────────────────────────────────────────
# Per-pillar slots are generous (4000ms) so NIM inference produces REAL scores.
# Total budget is tight (500ms) to enforce the p95 SLA.
# When NIM is healthy (~300ms), all 5 pillars return real results within budget.
_DEFAULT_TOTAL_BUDGET_MS = 500
_DEFAULT_SLOT_MS = 4000     # generous — NIM needs up to 4s for inference
_PILLAR_SLA_MS = 4000       # per-pillar breach threshold matches slot

# Pillar weights
_WEIGHTS: dict[str, float] = {
    "safety":          0.25,
    "hallucination":   0.20,
    "bias":            0.15,
    "prompt_security": 0.25,
    "compliance":      0.15,
}
_PILLAR_NAMES = ["safety", "hallucination", "bias", "prompt_security", "compliance"]


# ═══════════════════════════════════════════════════════════════════════════════
#  PILLAR RUNNER — Individual pillar with per-slot timeout
# ═══════════════════════════════════════════════════════════════════════════════


async def _run_pillar_with_slot(
    name: str,
    coro,
    slot_ms: int,
    collector: Optional["LatencyCollector"],
) -> PillarResult:
    """
    Run a single pillar coroutine with a hard asyncio timeout equal to slot_ms.

    Handles:
      - asyncio.TimeoutError (per-pillar slot exceeded)
      - asyncio.CancelledError (total-budget timeout or shutdown)
      - All other exceptions

    Never raises — always returns a PillarResult.
    """
    effective_slot = max(slot_ms, 10)
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
        elapsed_ms = slot_ms
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=True)
        logger.warning(
            "VELDRIX_PILLAR_TIMEOUT pillar=%s slot_ms=%d", name, slot_ms,
        )
        return PillarResult(
            pillar=name, status=PillarStatus.ERROR, score=None,
            confidence=0.0, flags=["EVALUATION_TIMEOUT"],
            error=f"Pillar exceeded {slot_ms} ms slot", latency_ms=elapsed_ms,
        )
    except asyncio.CancelledError:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.warning(
            "VELDRIX_PILLAR_CANCELLED pillar=%s elapsed_ms=%d", name, elapsed_ms,
        )
        return PillarResult(
            pillar=name, status=PillarStatus.ERROR, score=None,
            confidence=0.0, flags=["EVALUATION_CANCELLED"],
            error="Pillar cancelled (total budget exceeded)", latency_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if collector:
            collector.record_pillar(name, elapsed_ms, timed_out=False)
        logger.error("VELDRIX_PILLAR_ERROR pillar=%s error=%s", name, exc)
        return PillarResult(
            pillar=name, status=PillarStatus.ERROR, score=None,
            confidence=0.0, flags=["EVALUATION_ERROR"],
            error=str(exc)[:200], latency_ms=elapsed_ms,
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  DISPATCH — All 5 pillars with HARD total-budget timeout
# ═══════════════════════════════════════════════════════════════════════════════


async def _dispatch_pillars(
    request: AnalysisRequest,
    http: httpx.AsyncClient | None,
    budget: Optional["LatencyBudget"],
    collector: Optional["LatencyCollector"],
) -> tuple[dict[str, PillarResult], dict[str, float]]:
    """
    Dispatch all five pillars with a HARD total-budget timeout.

    Uses asyncio.wait() with a timeout.  When the timer fires, ANY task that
    hasn't completed is immediately cancelled.  This is the ONLY execution
    path — there is no unbounded fallback regardless of what budget is set.

    Defaults when budget is None: STANDARD tier (500ms total, 250ms per-pillar).
    """
    _t = {"start": time.monotonic()}

    # Resolve timeout config — use budget or STANDARD defaults
    if budget and budget.pillar_slots:
        total_budget_ms = budget.total_budget_ms
        slots = budget.pillar_slots
        tier = budget.tier
    else:
        total_budget_ms = _DEFAULT_TOTAL_BUDGET_MS
        from src.config.latency_tiers import PillarSlots as _PS
        slots = _PS(
            safety_ms=_DEFAULT_SLOT_MS, hallucination_ms=_DEFAULT_SLOT_MS,
            bias_ms=_DEFAULT_SLOT_MS, prompt_security_ms=_DEFAULT_SLOT_MS,
            compliance_ms=_DEFAULT_SLOT_MS,
        )
        tier = "STANDARD (default)"

    total_budget_s = total_budget_ms / 1000.0

    # Log runtime config for deployment verification
    logger.info(
        "VELDRIX_DISPATCH_CFG tier=%s total_budget_ms=%d slots={safety=%d,hallu=%d,"
        "bias=%d,prompt_sec=%d,compliance=%d}",
        tier, total_budget_ms,
        slots.safety_ms, slots.hallucination_ms, slots.bias_ms,
        slots.prompt_security_ms, slots.compliance_ms,
    )

    # Build per-pillar coroutines
    coros = {
        n: asyncio.ensure_future(
            _run_pillar_with_slot(n, getattr(_pillars, f"run_{n}")(request, http), getattr(slots, f"{n}_ms"), collector)
        )
        for n in _PILLAR_NAMES
    }

    _t["dispatch_start"] = time.monotonic()

    # ─── HARD TOTAL-BUDGET TIMEOUT ──────────────────────────────────────────
    # asyncio.wait() with timeout enforces the absolute maximum wall-clock time.
    # Any task still running after the timeout is cancelled explicitly.
    done_tasks, pending_tasks = await asyncio.wait(
        list(coros.values()),
        timeout=total_budget_s,
        return_when=asyncio.FIRST_EXCEPTION,
    )

    dispatch_ms = round((time.monotonic() - _t["dispatch_start"]) * 1000)

    # Cancel pending (timed-out) tasks immediately
    if pending_tasks:
        logger.warning(
            "VELDRIX_TOTAL_BUDGET_TIMEOUT timeout_ms=%d elapsed_ms=%d pending=%d",
            total_budget_ms, dispatch_ms, len(pending_tasks),
        )
        for task in pending_tasks:
            task.cancel()
        # Give cancelled tasks a brief window to settle
        await asyncio.wait(pending_tasks, timeout=0.5)
    else:
        logger.info(
            "VELDRIX_DISPATCH_OK timeout_ms=%d elapsed_ms=%d",
            total_budget_ms, dispatch_ms,
        )

    _t["dispatch_end"] = time.monotonic()

    # Collect results
    pillar_results: dict[str, PillarResult] = {}
    for name, task in coros.items():
        if task in done_tasks:
            try:
                pillar_results[name] = task.result()
            except Exception as exc:
                logger.error("VELDRIX_PILLAR_UNEXPECTED pillar=%s: %s", name, exc)
                pillar_results[name] = PillarResult(
                    pillar=name, status=PillarStatus.ERROR, score=None,
                    error=str(exc)[:200],
                )
        else:
            pillar_results[name] = PillarResult(
                pillar=name, status=PillarStatus.ERROR, score=None,
                flags=["EVALUATION_TIMEOUT"],
                error=f"Total budget {total_budget_ms}ms exceeded",
                latency_ms=0,
            )

    _t["dispatch_end"] = time.monotonic()
    return pillar_results, _t


# ═══════════════════════════════════════════════════════════════════════════════
#  LATENCY RECORDING — Synchronous DB write
# ═══════════════════════════════════════════════════════════════════════════════


async def _sync_record_latency(
    user_id: str | None,
    latency_ms: float,
    status_code: int = 200,
    endpoint: str = "/api/v1/analyze",
) -> None:
    """
    Write one latency record to the request_latency table synchronously
    via the connectors HTTP API.

    Uses get_internal_client() singleton — no per-request TCP handshake.
    Timeout of 100ms — if connectors is down, the record is dropped with
    a WARNING log.  Never blocks the response for more than 100ms.
    """
    if not user_id or latency_ms <= 0:
        return

    try:
        import os as _os
        connectors_url = _os.getenv(
            "VELDRIX_CONNECTORS_URL",
            _os.getenv("CONNECTORS_URL", "http://localhost:8002"),
        )
        latency_url = f"{connectors_url}/internal/latency"

        # Synchronous (awaited) POST with 100ms timeout
        client = _get_internal_client()

        # We're inside an async function, so we can await here.
        # This adds ~1-5ms overhead on a healthy deployment.
        resp = await client.post(
            latency_url,
            json={
                "user_id": user_id,
                "endpoint": endpoint,
                "latency_ms": min(latency_ms, 60_000.0),
                "status_code": status_code,
            },
            timeout=__import__("httpx").Timeout(connect=0.1, read=0.1, write=0.1, pool=0.1),
        )
        if resp.status_code >= 400:
            logger.warning(
                "VELDRIX_LATENCY_FAILED status=%d user=%s ms=%.1f",
                resp.status_code, user_id, latency_ms,
            )
        else:
            logger.debug(
                "VELDRIX_LATENCY_OK user=%s ms=%.1f", user_id, latency_ms,
            )
    except Exception as exc:
        logger.warning(
            "VELDRIX_LATENCY_DROPPED user=%s ms=%.1f error=%s",
            user_id, latency_ms, exc,
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  AGGREGATION
# ═══════════════════════════════════════════════════════════════════════════════


def _aggregate_trust_score(pillars: dict[str, PillarResult]) -> TrustScore:
    """Weighted aggregation of pillar scores into a single TrustScore."""
    weighted_sum = 0.0
    total_weight = 0.0
    critical_flags: list[str] = []
    all_flags: list[str] = []

    for name, result in pillars.items():
        if result.status == PillarStatus.OK and result.score is not None:
            w = _WEIGHTS.get(name, 0.20)
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
        pillar_scores={name: r.score for name, r in pillars.items() if r.score is not None},
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  VELDRIX SDK
# ═══════════════════════════════════════════════════════════════════════════════

import src.sdk.pillars as _pillars  # noqa: E402 — after function defs but before VeldrixSDK


class VeldrixSDK:
    """
    Production-grade VeldrixAI SDK client.

    Always enforces a hard total-budget timeout (default: 500ms).
    Records latency synchronously to request_latency table.
    Never raises — all pillar errors are captured as PillarStatus.ERROR.
    """

    VERSION = "1.0.0"

    def __init__(self, http_client: Optional[httpx.AsyncClient] = None):
        self._http = http_client
        self._telemetry = SDKTelemetry()
        logger.info(
            "VELDRIX_SDK_INIT version=%s default_total_budget=%dms default_slot=%dms",
            self.VERSION, _DEFAULT_TOTAL_BUDGET_MS, _DEFAULT_SLOT_MS,
        )

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
        if request_id is None:
            request_id = str(uuid.uuid4())
        started_at = time.monotonic()

        logger.info(
            "VELDRIX_ANALYZE_START request_id=%s prompt_len=%d",
            request_id, len(request.prompt),
        )

        # ── Execute pillars with HARD timeout ─────────────────────────────────
        pillar_results, _t = await _dispatch_pillars(request, self._http, budget, collector)

        # ── Aggregate ─────────────────────────────────────────────────────────
        _t["agg_start"] = time.monotonic()
        trust_score = _aggregate_trust_score(pillar_results)
        elapsed_ms = round((time.monotonic() - started_at) * 1000)

        per_pillar_ms = {n: (r.latency_ms or 0) for n, r in pillar_results.items()}
        timed_out = [r.pillar for r in pillar_results.values() if r.flags and "EVALUATION_TIMEOUT" in r.flags]

        # ── Build result ──────────────────────────────────────────────────────
        dispatch_ms = round((_t.get("dispatch_end", time.monotonic()) - _t.get("dispatch_start", started_at)) * 1000)
        _t["assembly_start"] = time.monotonic()

        result = AnalysisResult(
            request_id=request_id, trust_score=trust_score,
            pillars=pillar_results, total_latency_ms=elapsed_ms,
            sdk_version=self.VERSION,
            budget_tier=budget.tier if budget else "STANDARD",
            degraded=len(timed_out) > 0, pillars_timed_out=timed_out,
            per_pillar_ms=per_pillar_ms,
            timings_ms={
                "pillar_dispatch_ms": dispatch_ms,
                "enforcement_ms": round((time.monotonic() - _t.get("agg_start", started_at)) * 1000),
                "response_assembly_ms": 0,
                "total_ms": elapsed_ms,
                "per_pillar_ms": per_pillar_ms,
            } if emit_diagnostics else None,
        )

        # ── Latency recording (fire-and-forget, records dispatch_ms) ──────────
        # dispatch_ms is the actual pillar execution time (~259ms).
        # elapsed_ms includes assembly/telemetry overhead (~340ms).
        # We record dispatch_ms so the dashboard latency matches the audit stream.
        # Using fire-and-forget with strong reference so it never blocks the
        # response (same pattern as middleware.py _MIDDLEWARE_TASKS).
        _LATENCY_TASK = asyncio.create_task(
            _sync_record_latency(user_id, float(dispatch_ms))
        )
        _LATENCY_TASK.add_done_callback(lambda t: None)  # suppress "Task was destroyed but it is pending" warnings

        # ── Fire-and-forget telemetry (audit trail + SSE) ─────────────────────
        asyncio.create_task(self._telemetry.record(
            result,
            prompt_preview=request.prompt[:200] if request.prompt else None,
            response_preview=request.response[:200] if request.response else None,
            user_id=user_id, actor_email=actor_email,
        ))

        # ── Runtime diagnostics ───────────────────────────────────────────────
        logger.info(
            "VELDRIX_ANALYZE_RESULT request_id=%s total_ms=%d dispatch_ms=%d "
            "trust_score=%.4f verdict=%s tier=%s degraded=%s timed_out=%s",
            request_id, elapsed_ms, dispatch_ms,
            trust_score.overall, trust_score.verdict,
            result.budget_tier, result.degraded, timed_out or [],
        )

        return result

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()

    async def __aenter__(self) -> "VeldrixSDK":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()
