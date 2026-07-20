"""Per-pillar model routing matrix — the single source of truth for which model
serves each of the five trust pillars, on every provider.

Design goals (in priority order):
  1. DISTINCT, purpose-aligned frontier model per pillar. The five pillars are
     five different evaluation problems; one shared model flattens them into one.
  2. DETERMINISTIC decoding. Every pillar call pins temperature, top_p and seed
     so the same (prompt, response) pair maps to the same verdict. Providers do
     not guarantee bit-exact reproducibility for MoE serving, but pinned decoding
     plus deterministic model selection removes every source of variance we control.
  3. PROVIDER-COMPLETE. The matrix resolves a model for *every* provider, not just
     NVIDIA NIM — a Groq/Bedrock/OSS failover no longer collapses all five pillars
     onto one generic model.

Default matrix (NVIDIA NIM primaries):
  Safety / Content   meta/llama-guard-4-12b                    purpose-built safety classifier
  Hallucination      nvidia/nemotron-3-ultra-550b-a55b         550B MoE reasoning flagship
  Bias & Ethics      mistralai/mistral-large-3-675b-instruct-2512  675B MoE, multi-perspective judgement
  Prompt Security    nvidia/llama-3.1-nemotron-ultra-253b-v1   253B dense, long rule-set adherence
  Legal / Compliance meta/llama-3.1-405b-instruct              405B dense, broad legal corpus

Override any field via environment (`__` delimiter for nested fields):
  VELDRIX_PILLAR_MODEL__HALLUCINATION__PRIMARY=nvidia/nemotron-3-ultra-550b-a55b
  VELDRIX_PILLAR_MODEL__HALLUCINATION__FALLBACK=nvidia/llama-3.1-nemotron-ultra-253b-v1
  VELDRIX_PILLAR_MODEL__HALLUCINATION__GROQ=llama-3.3-70b-versatile
  VELDRIX_PILLAR_MODEL__HALLUCINATION__TEMPERATURE=0.0
  VELDRIX_PILLAR_MODEL__HALLUCINATION__TOP_P=1.0
  VELDRIX_PILLAR_MODEL__HALLUCINATION__SEED=42
  VELDRIX_PILLAR_MODEL__HALLUCINATION__MAX_TOKENS=1024
  VELDRIX_PILLAR_MODEL__HALLUCINATION__TIMEOUT_SECONDS=30

Note: the pre-2026 ``VELDRIX_PILLAR_*_MODEL`` env vars are intentionally NOT
read. They stopped being consumed when this matrix was introduced, and stale
values in deployed env files (pinned to 8B models) must not silently override
the heavyweight defaults. Delete them from your env files.

Global determinism knobs:
  VELDRIX_INFERENCE_SEED   — seed applied to every pillar call (default 42)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict


# Groq keeps a small catalogue; it is the resilience failover, not the quality
# path, so all reasoning pillars share its strongest stable general model while
# the safety pillar keeps a purpose-built guard model.
_GROQ_GUARD_MODEL = "meta-llama/llama-guard-4-12b"
_GROQ_REASONING_MODEL = "llama-3.3-70b-versatile"


def _global_seed() -> int:
    return int(os.environ.get("VELDRIX_INFERENCE_SEED", "42"))


def _env(pillar: str, field_name: str, default: str) -> str:
    return os.environ.get(f"VELDRIX_PILLAR_MODEL__{pillar}__{field_name}", default)


def _env_float(pillar: str, field_name: str, default: float) -> float:
    return float(_env(pillar, field_name, str(default)))


def _env_int(pillar: str, field_name: str, default: int) -> int:
    return int(_env(pillar, field_name, str(default)))


@dataclass(frozen=True)
class PillarModelConfig:
    """Full inference contract for one pillar: models per provider + pinned decoding."""

    primary:  str                 # NVIDIA NIM primary model
    fallback: str                 # NVIDIA NIM fallback model (model-level retry)
    provider_models: Dict[str, str] = field(default_factory=dict)  # non-NIM provider → model
    temperature:     float = 0.0
    top_p:           float = 1.0
    seed:            int   = 42
    max_tokens:      int   = 1024
    timeout_seconds: float = 30.0

    def primary_model_map(self) -> Dict[str, str]:
        """Provider name → model to use when that provider serves the call."""
        return {"nvidia_nim": self.primary, **self.provider_models}

    def fallback_model_map(self) -> Dict[str, str]:
        """Same map with the NIM slot swapped to the fallback model."""
        return {"nvidia_nim": self.fallback, **self.provider_models}

    def resolve_model(self, provider_name: str, fallback_used: bool = False) -> str:
        """Deterministically name the model that served, given the provider."""
        model_map = self.fallback_model_map() if fallback_used else self.primary_model_map()
        return model_map.get(provider_name, f"{provider_name}:provider-default")


@dataclass(frozen=True)
class PillarModelMatrix:
    safety_toxicity: PillarModelConfig
    hallucination:   PillarModelConfig
    bias_fairness:   PillarModelConfig
    prompt_security: PillarModelConfig
    compliance_pii:  PillarModelConfig

    def distinct_primaries(self) -> set:
        return {
            self.safety_toxicity.primary,
            self.hallucination.primary,
            self.bias_fairness.primary,
            self.prompt_security.primary,
            self.compliance_pii.primary,
        }


def build_pillar_model_matrix() -> PillarModelMatrix:
    seed = _global_seed()
    return PillarModelMatrix(
        safety_toxicity=PillarModelConfig(
            # Purpose-built safety classifier — a general frontier model is *worse*
            # here: llama-guard's fixed taxonomy and verdict format are what make
            # the content pillar deterministic. Never swap for a chat model.
            primary=_env("SAFETY", "PRIMARY", "meta/llama-guard-4-12b"),
            fallback=_env("SAFETY", "FALLBACK", "meta/llama-guard-3-8b"),
            provider_models={"groq": _env("SAFETY", "GROQ", _GROQ_GUARD_MODEL)},
            temperature=_env_float("SAFETY", "TEMPERATURE", 0.0),
            top_p=_env_float("SAFETY", "TOP_P", 1.0),
            seed=_env_int("SAFETY", "SEED", seed),
            max_tokens=_env_int("SAFETY", "MAX_TOKENS", 128),
            timeout_seconds=_env_float("SAFETY", "TIMEOUT_SECONDS", 10.0),
        ),
        hallucination=PillarModelConfig(
            # Factuality assessment is the hardest reasoning task in the matrix —
            # it gets the strongest reasoning model on the catalogue (550B MoE,
            # 55B active, Mamba-Transformer hybrid).
            primary=_env("HALLUCINATION", "PRIMARY", "nvidia/nemotron-3-ultra-550b-a55b"),
            fallback=_env("HALLUCINATION", "FALLBACK", "nvidia/llama-3.1-nemotron-ultra-253b-v1"),
            provider_models={"groq": _env("HALLUCINATION", "GROQ", _GROQ_REASONING_MODEL)},
            temperature=_env_float("HALLUCINATION", "TEMPERATURE", 0.0),
            top_p=_env_float("HALLUCINATION", "TOP_P", 1.0),
            seed=_env_int("HALLUCINATION", "SEED", seed),
            max_tokens=_env_int("HALLUCINATION", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("HALLUCINATION", "TIMEOUT_SECONDS", 30.0),
        ),
        bias_fairness=PillarModelConfig(
            # Bias judgement rewards breadth of perspective over raw reasoning depth;
            # Mistral Large 3 (675B MoE, 41B active) is a different model family from
            # the Nemotron pillars by design — family diversity reduces correlated blind spots.
            primary=_env("BIAS", "PRIMARY", "mistralai/mistral-large-3-675b-instruct-2512"),
            fallback=_env("BIAS", "FALLBACK", "mistralai/mistral-medium-3-5-128b"),
            provider_models={"groq": _env("BIAS", "GROQ", _GROQ_REASONING_MODEL)},
            temperature=_env_float("BIAS", "TEMPERATURE", 0.0),
            top_p=_env_float("BIAS", "TOP_P", 1.0),
            seed=_env_int("BIAS", "SEED", seed),
            max_tokens=_env_int("BIAS", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("BIAS", "TIMEOUT_SECONDS", 30.0),
        ),
        prompt_security=PillarModelConfig(
            # Policy adherence over long in-context rule sets; Nemotron Ultra 253B
            # holds system-prompt constraints reliably at depth.
            primary=_env("PROMPT_SECURITY", "PRIMARY", "nvidia/llama-3.1-nemotron-ultra-253b-v1"),
            fallback=_env("PROMPT_SECURITY", "FALLBACK", "nvidia/llama-3.3-nemotron-super-49b-v1.5"),
            provider_models={"groq": _env("PROMPT_SECURITY", "GROQ", _GROQ_REASONING_MODEL)},
            temperature=_env_float("PROMPT_SECURITY", "TEMPERATURE", 0.0),
            top_p=_env_float("PROMPT_SECURITY", "TOP_P", 1.0),
            seed=_env_int("PROMPT_SECURITY", "SEED", seed),
            max_tokens=_env_int("PROMPT_SECURITY", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("PROMPT_SECURITY", "TIMEOUT_SECONDS", 25.0),
        ),
        compliance_pii=PillarModelConfig(
            # Legal exposure needs corpus breadth (jurisdictions, regulation text);
            # the 405B dense Llama has the widest stable knowledge coverage on NIM.
            # NIM retired meta/llama-3.1-405b-instruct mid-2026 (404) — Llama 4
            # Maverick (~400B MoE) is the heavyweight Meta successor it hosts.
            primary=_env("COMPLIANCE", "PRIMARY", "meta/llama-4-maverick-17b-128e-instruct"),
            fallback=_env("COMPLIANCE", "FALLBACK", "meta/llama-3.3-70b-instruct"),
            provider_models={"groq": _env("COMPLIANCE", "GROQ", _GROQ_REASONING_MODEL)},
            temperature=_env_float("COMPLIANCE", "TEMPERATURE", 0.0),
            top_p=_env_float("COMPLIANCE", "TOP_P", 1.0),
            seed=_env_int("COMPLIANCE", "SEED", seed),
            max_tokens=_env_int("COMPLIANCE", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("COMPLIANCE", "TIMEOUT_SECONDS", 30.0),
        ),
    )


# Built once at module import — used by all pillar implementations
PILLAR_MODELS: PillarModelMatrix = build_pillar_model_matrix()
