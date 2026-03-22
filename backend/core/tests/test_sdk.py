"""
VeldrixAI SDK integration tests.
Run with:
    cd aegisai-core
    pytest tests/test_sdk.py -v --tb=short
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from src.sdk.client import VeldrixSDK, _aggregate_trust_score
from src.sdk.models import AnalysisRequest, PillarResult, PillarStatus


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
