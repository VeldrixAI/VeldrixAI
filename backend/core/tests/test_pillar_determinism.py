"""
Tests for the deterministic pillar model matrix and inference wiring.

Covers:
  - Five DISTINCT heavyweight primary models (no single-model flattening)
  - Env override precedence for the canonical VELDRIX_PILLAR_MODEL__ pattern
  - Legacy VELDRIX_PILLAR_*_MODEL vars are intentionally ignored
  - Deterministic routing flag disables the speculative provider race
  - Router forwards pinned decoding params (temperature/top_p/seed) and the
    per-provider model map into the provider payload
  - Pillars pass their full model contract (max_tokens/timeout/seed) — the old
    wiring silently dropped per-pillar max_tokens, truncating JSON verdicts
  - Primary → fallback model retry surfaces in the decision trace
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.config.pillar_models import build_pillar_model_matrix
from src.inference.exceptions import InferenceExhaustedError
from src.inference.router import (
    _deterministic_routing_enabled,
    _resolve_model,
    _speculative_enabled,
)
from src.inference.providers import ProviderConfig
from src.domain.types import TrustEvaluationContext, TrustEvaluationInput
from src.pillars.implementations.ai_safety_pillars import HallucinationPillar
from src.pillars.types import PillarStatus

pytestmark = pytest.mark.asyncio

_ROUTE_PATH = "src.pillars.implementations.ai_safety_pillars.route_inference"


def _provider(name: str, model_id: str = "default-model") -> ProviderConfig:
    return ProviderConfig(
        name=name,
        base_url="https://example.invalid/v1",
        api_key_env="X_TEST_KEY",
        model_id=model_id,
        priority=1,
        timeout_seconds=4.0,
        max_retries=1,
        supports_json_mode=False,
        health_endpoint=None,
    )


# ── Model matrix ──────────────────────────────────────────────────────────────


def test_matrix_has_five_distinct_primaries():
    matrix = build_pillar_model_matrix()
    assert len(matrix.distinct_primaries()) == 5


def test_matrix_decoding_pinned_for_determinism():
    matrix = build_pillar_model_matrix()
    for cfg in (
        matrix.safety_toxicity,
        matrix.hallucination,
        matrix.bias_fairness,
        matrix.prompt_security,
        matrix.compliance_pii,
    ):
        assert cfg.temperature == 0.0
        assert cfg.top_p == 1.0
        assert cfg.seed == 42


def test_matrix_env_override_canonical_pattern(monkeypatch):
    monkeypatch.setenv("VELDRIX_PILLAR_MODEL__HALLUCINATION__PRIMARY", "custom/model-x")
    monkeypatch.setenv("VELDRIX_PILLAR_MODEL__HALLUCINATION__SEED", "7")
    matrix = build_pillar_model_matrix()
    assert matrix.hallucination.primary == "custom/model-x"
    assert matrix.hallucination.seed == 7


def test_matrix_ignores_legacy_env_vars(monkeypatch):
    """Stale VELDRIX_PILLAR_*_MODEL vars in deployed env files (pinned to 8B
    models) must not silently downgrade the heavyweight defaults."""
    monkeypatch.setenv("VELDRIX_PILLAR_HALLUCINATION_MODEL", "meta/llama-3.1-8b-instruct")
    matrix = build_pillar_model_matrix()
    assert matrix.hallucination.primary == "nvidia/nemotron-3-ultra-550b-a55b"


def test_matrix_global_seed_env(monkeypatch):
    monkeypatch.setenv("VELDRIX_INFERENCE_SEED", "1234")
    matrix = build_pillar_model_matrix()
    assert matrix.bias_fairness.seed == 1234
    assert matrix.compliance_pii.seed == 1234


def test_provider_model_maps():
    matrix = build_pillar_model_matrix()
    cfg = matrix.hallucination
    primary_map = cfg.primary_model_map()
    fallback_map = cfg.fallback_model_map()
    assert primary_map["nvidia_nim"] == cfg.primary
    assert fallback_map["nvidia_nim"] == cfg.fallback
    assert "groq" in primary_map  # failover no longer collapses onto GROQ_MODEL_ID
    assert cfg.resolve_model("nvidia_nim") == cfg.primary
    assert cfg.resolve_model("nvidia_nim", fallback_used=True) == cfg.fallback


# ── Router determinism ────────────────────────────────────────────────────────


def test_deterministic_routing_is_default(monkeypatch):
    monkeypatch.delenv("VELDRIX_DETERMINISTIC_ROUTING", raising=False)
    assert _deterministic_routing_enabled() is True
    assert _speculative_enabled() is False


def test_speculative_requires_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("VELDRIX_DETERMINISTIC_ROUTING", "false")
    monkeypatch.setenv("VELDRIX_SPECULATIVE_EXECUTION", "true")
    assert _speculative_enabled() is True

    # Deterministic mode wins even when speculative is requested
    monkeypatch.setenv("VELDRIX_DETERMINISTIC_ROUTING", "true")
    assert _speculative_enabled() is False


def test_resolve_model_precedence():
    nim = _provider("nvidia_nim", model_id="nim-default")
    groq = _provider("groq", model_id="groq-default")

    # 1. Per-provider map wins everywhere
    assert _resolve_model(nim, "override-model", {"nvidia_nim": "mapped-nim"}) == "mapped-nim"
    assert _resolve_model(groq, "override-model", {"groq": "mapped-groq"}) == "mapped-groq"
    # 2. model_override applies to NIM only
    assert _resolve_model(nim, "override-model", None) == "override-model"
    assert _resolve_model(groq, "override-model", None) == "groq-default"
    # 3. Provider default is the last resort
    assert _resolve_model(nim, None, None) == "nim-default"


async def test_call_provider_payload_pins_decoding(monkeypatch):
    """The provider payload must carry model-map model, top_p and seed."""
    from src.inference import router as router_mod

    captured: dict = {}

    class _FakeResponse:
        status_code = 200
        text = json.dumps({"choices": [{"message": {"content": "ok"}}]})

        def json(self):
            return json.loads(self.text)

        def raise_for_status(self):
            return None

    class _FakeClient:
        async def post(self, url, json=None, timeout=None):
            captured["url"] = url
            captured["payload"] = json
            captured["timeout"] = timeout
            return _FakeResponse()

    monkeypatch.setattr(router_mod, "_get_or_create_client", lambda p: _FakeClient())

    content = await router_mod._call_provider(
        provider=_provider("groq", model_id="groq-default"),
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.0,
        max_tokens=512,
        model_override="nim-only-model",
        pillar_name="TestPillar",
        attempt=1,
        top_p=1.0,
        seed=42,
        provider_models={"groq": "pillar-designated-model"},
        timeout_seconds=30.0,
    )

    assert content == "ok"
    payload = captured["payload"]
    assert payload["model"] == "pillar-designated-model"
    assert payload["temperature"] == 0.0
    assert payload["top_p"] == 1.0
    assert payload["seed"] == 42
    assert payload["max_tokens"] == 512
    assert captured["timeout"] == 30.0


# ── Pillar wiring ─────────────────────────────────────────────────────────────


def _hallucination_verdict() -> str:
    return json.dumps({
        "hallucination_risk": 0.1,
        "confidence": 0.9,
        "uncertain_claims": [],
        "grounded": True,
    })


async def test_pillar_forwards_full_model_contract():
    """Regression: the old wiring dropped per-pillar max_tokens (JSON verdicts
    were truncated at the router's 256 default) and never sent seed/top_p."""
    captured_kwargs: dict = {}

    async def _capture(messages, pillar_name, **kwargs):
        captured_kwargs.update(kwargs)
        return (_hallucination_verdict(), "nvidia_nim")

    with patch(_ROUTE_PATH, _capture):
        pillar = HallucinationPillar()
        result = await pillar.evaluate(
            TrustEvaluationInput(prompt="p", response="r", model="m"),
            TrustEvaluationContext(request_id="det-001"),
        )

    assert result.status == PillarStatus.SUCCESS
    assert captured_kwargs["max_tokens"] == 1024
    assert captured_kwargs["timeout_seconds"] == 30.0
    assert captured_kwargs["temperature"] == 0.0
    assert captured_kwargs["top_p"] == 1.0
    assert captured_kwargs["seed"] == 42
    assert captured_kwargs["model_override"] == "nvidia/nemotron-3-ultra-550b-a55b"
    assert captured_kwargs["provider_models"]["nvidia_nim"] == "nvidia/nemotron-3-ultra-550b-a55b"


async def test_pillar_records_decision_trace():
    with patch(_ROUTE_PATH, AsyncMock(return_value=(_hallucination_verdict(), "nvidia_nim"))):
        pillar = HallucinationPillar()
        result = await pillar.evaluate(
            TrustEvaluationInput(prompt="p", response="r", model="m"),
            TrustEvaluationContext(request_id="det-002"),
        )

    assert result.details["provider"] == "nvidia_nim"
    assert result.details["model"] == "nvidia/nemotron-3-ultra-550b-a55b"
    assert result.details["fallback_model_used"] is False
    assert result.details["seed"] == 42


async def test_pillar_fallback_model_retry():
    """Primary exhausted on all providers → one retry with the fallback model,
    recorded in the decision trace."""
    calls: list[dict] = []

    async def _first_exhausted(messages, pillar_name, **kwargs):
        calls.append({"pillar_name": pillar_name, **kwargs})
        if len(calls) == 1:
            raise InferenceExhaustedError(pillar=pillar_name, providers_attempted=["nvidia_nim"])
        return (_hallucination_verdict(), "nvidia_nim")

    with patch(_ROUTE_PATH, _first_exhausted):
        pillar = HallucinationPillar()
        result = await pillar.evaluate(
            TrustEvaluationInput(prompt="p", response="r", model="m"),
            TrustEvaluationContext(request_id="det-003"),
        )

    assert result.status == PillarStatus.SUCCESS
    assert len(calls) == 2
    assert calls[1]["model_override"] == "nvidia/llama-3.1-nemotron-ultra-253b-v1"
    assert calls[1]["provider_models"]["nvidia_nim"] == "nvidia/llama-3.1-nemotron-ultra-253b-v1"
    assert result.details["fallback_model_used"] is True
    assert result.details["model"] == "nvidia/llama-3.1-nemotron-ultra-253b-v1"
