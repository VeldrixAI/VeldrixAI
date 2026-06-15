"""
VeldrixAI SDK integration tests.
Run with:
    cd aegisai-core
    pytest tests/test_sdk.py -v --tb=short
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

import asyncio
import time

from src.sdk.client import VeldrixSDK, _aggregate_trust_score
from src.sdk.models import AnalysisRequest, PillarResult, PillarStatus
from src.config.latency_tiers import LatencyBudget, PillarSlots


SAMPLE_REQUEST = AnalysisRequest(
    prompt="What is the capital of France?",
    response="The capital of France is Paris.",
)

MOCK_OK_PILLAR = PillarResult(
    pillar="safety", status=PillarStatus.OK, score=0.95,
    confidence=0.98, flags=[], latency_ms=120,
)

MOCK_ERROR_PILLAR = PillarResult(
    pillar="hallucination", status=PillarStatus.ERROR,
    score=None, error="NIM timeout", latency_ms=5000,
)


@pytest.mark.asyncio
async def test_analyze_all_pillars_ok():
    """All pillars return OK → trust score > 0.8, verdict ALLOW."""
    ok = MOCK_OK_PILLAR

    with patch("src.sdk.pillars.run_safety",          new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_hallucination",   new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_bias",            new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_prompt_security", new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_compliance",      new=AsyncMock(return_value=ok)):

        async with VeldrixSDK() as sdk:
            result = await sdk.analyze(SAMPLE_REQUEST)

    assert result.trust_score.overall > 0.8
    assert result.trust_score.verdict == "ALLOW"
    assert len(result.pillars) == 5
    assert all(p.status == PillarStatus.OK for p in result.pillars.values())


@pytest.mark.asyncio
async def test_analyze_pillar_error_does_not_crash():
    """A failed pillar must NOT raise — it captures the error and continues."""
    ok = PillarResult(pillar="safety", status=PillarStatus.OK, score=0.95, flags=[])

    with patch("src.sdk.pillars.run_safety",          new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_hallucination",   new=AsyncMock(side_effect=RuntimeError("NIM down"))), \
         patch("src.sdk.pillars.run_bias",            new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_prompt_security", new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_compliance",      new=AsyncMock(return_value=ok)):

        async with VeldrixSDK() as sdk:
            result = await sdk.analyze(SAMPLE_REQUEST)

    assert result is not None
    assert result.pillars["hallucination"].status == PillarStatus.ERROR


def test_aggregate_trust_score_weighted():
    """All perfect scores → overall 1.0, verdict ALLOW."""
    pillars = {
        name: PillarResult(pillar=name, status=PillarStatus.OK, score=1.0, flags=[])
        for name in ("safety", "hallucination", "bias", "prompt_security", "compliance")
    }
    ts = _aggregate_trust_score(pillars)
    assert ts.overall == 1.0
    assert ts.verdict == "ALLOW"
    assert ts.critical_flags == []


def test_aggregate_critical_flag_forces_block():
    """A critical flag on a safety/prompt_security pillar → verdict BLOCK."""
    pillars = {
        "safety":          PillarResult(pillar="safety",          status=PillarStatus.OK, score=0.1,  flags=["violence"]),
        "hallucination":   PillarResult(pillar="hallucination",   status=PillarStatus.OK, score=0.9,  flags=[]),
        "bias":            PillarResult(pillar="bias",            status=PillarStatus.OK, score=0.9,  flags=[]),
        "prompt_security": PillarResult(pillar="prompt_security", status=PillarStatus.OK, score=0.9,  flags=[]),
        "compliance":      PillarResult(pillar="compliance",      status=PillarStatus.OK, score=0.9,  flags=[]),
    }
    ts = _aggregate_trust_score(pillars)
    assert ts.verdict == "BLOCK"
    assert "violence" in ts.critical_flags


def test_operational_timeout_does_not_force_block():
    """
    Regression (E2E Turn 1): a benign exchange whose prompt_security pillar
    TIMED OUT must NOT be BLOCKed. EVALUATION_TIMEOUT is an operational failure,
    not a content violation — it must never appear in critical_flags or trigger
    a BLOCK verdict. The result is surfaced as REVIEW (degraded), not blocked.
    """
    pillars = {
        "safety":          PillarResult(pillar="safety",          status=PillarStatus.OK,    score=0.95, flags=[]),
        "hallucination":   PillarResult(pillar="hallucination",   status=PillarStatus.OK,    score=0.80, flags=[]),
        "bias":            PillarResult(pillar="bias",            status=PillarStatus.OK,    score=0.92, flags=[]),
        "prompt_security": PillarResult(pillar="prompt_security", status=PillarStatus.ERROR, score=None, flags=["EVALUATION_TIMEOUT"]),
        "compliance":      PillarResult(pillar="compliance",      status=PillarStatus.OK,    score=0.90, flags=[]),
    }
    ts = _aggregate_trust_score(pillars)
    assert ts.verdict != "BLOCK"                       # the bug: was BLOCK
    assert ts.verdict == "REVIEW"                      # degraded, surfaced for review
    assert "EVALUATION_TIMEOUT" not in ts.critical_flags
    assert "EVALUATION_TIMEOUT" in ts.all_flags        # still recorded for observability


def test_clean_high_score_still_allows():
    """A fully-evaluated benign exchange (Turn 2) stays ALLOW after the fix."""
    pillars = {
        "safety":          PillarResult(pillar="safety",          status=PillarStatus.OK, score=0.95, flags=[]),
        "hallucination":   PillarResult(pillar="hallucination",   status=PillarStatus.OK, score=1.00, flags=[]),
        "bias":            PillarResult(pillar="bias",            status=PillarStatus.OK, score=0.92, flags=[]),
        "prompt_security": PillarResult(pillar="prompt_security", status=PillarStatus.OK, score=0.95, flags=[]),
        "compliance":      PillarResult(pillar="compliance",      status=PillarStatus.OK, score=0.90, flags=[]),
    }
    ts = _aggregate_trust_score(pillars)
    assert ts.verdict == "ALLOW"
    assert ts.critical_flags == []


@pytest.mark.asyncio
async def test_slow_pillar_respects_total_budget_without_settle_penalty():
    """
    Regression (E2E latency): when one pillar hangs, total latency must stay
    close to the total budget — NOT budget + 500ms settle. Uses a tight 200ms
    budget and a pillar that sleeps far longer; the request must return in well
    under 2x budget, the slow pillar is reported as timed out, and a benign
    exchange is NOT blocked.
    """
    ok = PillarResult(pillar="x", status=PillarStatus.OK, score=0.95, flags=[])

    async def _hang(*_a, **_k):
        await asyncio.sleep(5.0)  # far exceeds the 200ms budget
        return ok

    budget = LatencyBudget(
        tier="TEST", total_budget_ms=200, background_mode=False,
        pillar_slots=PillarSlots(
            safety_ms=4000, hallucination_ms=4000, bias_ms=4000,
            prompt_security_ms=4000, compliance_ms=4000,
        ),
    )

    with patch("src.sdk.pillars.run_safety",          new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_hallucination",   new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_bias",            new=AsyncMock(return_value=ok)), \
         patch("src.sdk.pillars.run_prompt_security", new=_hang), \
         patch("src.sdk.pillars.run_compliance",      new=AsyncMock(return_value=ok)):

        async with VeldrixSDK() as sdk:
            t0 = time.perf_counter()
            result = await sdk.analyze(SAMPLE_REQUEST, budget=budget)
            wall_ms = (time.perf_counter() - t0) * 1000

    # Old behaviour: ~200ms budget + 500ms settle ≈ 700ms+. Fixed: < 400ms.
    assert wall_ms < 400, f"dispatch took {wall_ms:.0f}ms — settle penalty regressed"
    assert "prompt_security" in result.pillars_timed_out
    assert result.degraded is True
    assert result.trust_score.verdict != "BLOCK"
