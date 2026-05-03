"""Per-pillar model routing configuration.

Each pillar has a purpose-aligned primary model and a fallback.
All models are configurable via environment variables using the
VELDRIX_PILLAR_MODEL__{PILLAR}__{FIELD} pattern.

Model assignment rationale (in code comments):
  - Safety: llama-guard-4-12b is purpose-built for safety classification.
  - Hallucination, Bias, Compliance: 70B reasoning models; cost justified by
    accuracy lift over 8B. This is the moat against "we just call llama-guard."
  - Prompt Security: 8B classification task — 70B is wasted compute here.

Override via environment (__ delimiter for nested fields):
  VELDRIX_PILLAR_MODEL__HALLUCINATION__PRIMARY=meta/llama-3.3-70b-instruct
  VELDRIX_PILLAR_MODEL__HALLUCINATION__FALLBACK=meta/llama-3.1-70b-instruct
  VELDRIX_PILLAR_MODEL__HALLUCINATION__TEMPERATURE=0.0
  VELDRIX_PILLAR_MODEL__HALLUCINATION__MAX_TOKENS=1024
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class PillarModelConfig:
    primary:        str
    fallback:       str
    temperature:    float = 0.0
    max_tokens:     int   = 1024
    timeout_seconds: float = 8.0


def _env(pillar: str, field: str, default: str) -> str:
    return os.environ.get(f"VELDRIX_PILLAR_MODEL__{pillar}__{field}", default)


def _env_float(pillar: str, field: str, default: float) -> float:
    return float(_env(pillar, field, str(default)))


def _env_int(pillar: str, field: str, default: int) -> int:
    return int(_env(pillar, field, str(default)))


@dataclass
class PillarModelMatrix:
    safety_toxicity: PillarModelConfig
    hallucination:   PillarModelConfig
    bias_fairness:   PillarModelConfig
    prompt_security: PillarModelConfig
    compliance_pii:  PillarModelConfig


def build_pillar_model_matrix() -> PillarModelMatrix:
    return PillarModelMatrix(
        safety_toxicity=PillarModelConfig(
            # Purpose-built safety classifier — keep on llama-guard, never swap for a general model
            primary=_env("SAFETY", "PRIMARY", "meta/llama-guard-4-12b"),
            fallback=_env("SAFETY", "FALLBACK", "meta/llama-guard-3-8b"),
            temperature=_env_float("SAFETY", "TEMPERATURE", 0.0),
            max_tokens=_env_int("SAFETY", "MAX_TOKENS", 256),
            timeout_seconds=_env_float("SAFETY", "TIMEOUT_SECONDS", 8.0),
        ),
        hallucination=PillarModelConfig(
            # Strong reasoning required; 70B provides the factuality precision
            # needed to distinguish hallucination from correct synthesis
            primary=_env("HALLUCINATION", "PRIMARY", "meta/llama-3.3-70b-instruct"),
            fallback=_env("HALLUCINATION", "FALLBACK", "meta/llama-3.1-70b-instruct"),
            temperature=_env_float("HALLUCINATION", "TEMPERATURE", 0.0),
            max_tokens=_env_int("HALLUCINATION", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("HALLUCINATION", "TIMEOUT_SECONDS", 10.0),
        ),
        bias_fairness=PillarModelConfig(
            # Nuanced multi-perspective evaluation; 70B captures subtler framing than 8B
            primary=_env("BIAS", "PRIMARY", "meta/llama-3.3-70b-instruct"),
            fallback=_env("BIAS", "FALLBACK", "meta/llama-3.1-70b-instruct"),
            temperature=_env_float("BIAS", "TEMPERATURE", 0.0),
            max_tokens=_env_int("BIAS", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("BIAS", "TIMEOUT_SECONDS", 10.0),
        ),
        prompt_security=PillarModelConfig(
            # Classification task only; 8B is correctly-sized and avoids wasted compute
            primary=_env("PROMPT_SECURITY", "PRIMARY", "meta/llama-3.1-8b-instruct"),
            fallback=_env("PROMPT_SECURITY", "FALLBACK", "mistralai/mistral-7b-instruct-v0.3"),
            temperature=_env_float("PROMPT_SECURITY", "TEMPERATURE", 0.0),
            max_tokens=_env_int("PROMPT_SECURITY", "MAX_TOKENS", 512),
            timeout_seconds=_env_float("PROMPT_SECURITY", "TIMEOUT_SECONDS", 6.0),
        ),
        compliance_pii=PillarModelConfig(
            # High-precision pattern+reasoning; 70B improves PII boundary detection accuracy
            primary=_env("COMPLIANCE", "PRIMARY", "meta/llama-3.3-70b-instruct"),
            fallback=_env("COMPLIANCE", "FALLBACK", "meta/llama-3.1-70b-instruct"),
            temperature=_env_float("COMPLIANCE", "TEMPERATURE", 0.0),
            max_tokens=_env_int("COMPLIANCE", "MAX_TOKENS", 1024),
            timeout_seconds=_env_float("COMPLIANCE", "TIMEOUT_SECONDS", 10.0),
        ),
    )


# Built once at module import — used by all pillar implementations
PILLAR_MODELS: PillarModelMatrix = build_pillar_model_matrix()
