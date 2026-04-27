"""Provider registry for multi-provider inference routing.

Defines ProviderConfig and builds the active provider list from environment
variables at import time. Providers whose required env vars are absent are
silently excluded and logged.

Priority order (lowest number = highest priority):
  1  NVIDIA NIM          — primary, llama-guard + llama-3.1 models
  2  Groq                — fast LLM fallback, free tier available
  3  AWS Bedrock proxy   — enterprise / regulated deployments (optional)
  4  OSS local fallback  — vLLM / Ollama, air-gapped deployments (optional)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ProviderConfig:
    name: str
    base_url: str
    api_key_env: str
    model_id: str
    priority: int
    timeout_seconds: float
    max_retries: int
    supports_json_mode: bool
    health_endpoint: Optional[str]


def _build_registry() -> list[ProviderConfig]:
    active: list[ProviderConfig] = []
    excluded: list[str] = []

    # ── Priority 1: NVIDIA NIM ────────────────────────────────────────────────
    nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
    if nvidia_key:
        active.append(ProviderConfig(
            name="nvidia_nim",
            base_url=os.environ.get("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            api_key_env="NVIDIA_API_KEY",
            model_id=os.environ.get("NVIDIA_MODEL_ID", "meta/llama-3.1-70b-instruct"),
            priority=1,
            timeout_seconds=8.0,
            max_retries=2,
            supports_json_mode=False,
            health_endpoint=None,
        ))
    else:
        excluded.append("nvidia_nim (NVIDIA_API_KEY not set)")

    # ── Priority 2: Groq ──────────────────────────────────────────────────────
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        active.append(ProviderConfig(
            name="groq",
            base_url="https://api.groq.com/openai/v1",
            api_key_env="GROQ_API_KEY",
            model_id=os.environ.get("GROQ_MODEL_ID", "llama-3.3-70b-versatile"),
            priority=2,
            timeout_seconds=6.0,
            max_retries=2,
            supports_json_mode=True,
            health_endpoint=None,
        ))
    else:
        excluded.append("groq (GROQ_API_KEY not set)")

    # ── Priority 3: AWS Bedrock proxy (optional) ──────────────────────────────
    bedrock_url = os.environ.get("BEDROCK_PROXY_URL", "")
    if bedrock_url:
        active.append(ProviderConfig(
            name="bedrock",
            base_url=bedrock_url,
            api_key_env="BEDROCK_API_KEY",
            model_id=os.environ.get(
                "BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"
            ),
            priority=3,
            timeout_seconds=10.0,
            max_retries=1,
            supports_json_mode=False,
            health_endpoint=None,
        ))
    else:
        excluded.append("bedrock (BEDROCK_PROXY_URL not set)")

    # ── Priority 4: OSS local fallback (optional) ─────────────────────────────
    oss_url = os.environ.get("OSS_INFERENCE_URL", "")
    if oss_url:
        active.append(ProviderConfig(
            name="oss_fallback",
            base_url=oss_url,
            api_key_env="OSS_API_KEY",
            model_id=os.environ.get("OSS_MODEL_ID", "llama3.1:8b"),
            priority=4,
            timeout_seconds=15.0,
            max_retries=1,
            supports_json_mode=False,
            health_endpoint=None,
        ))
    else:
        excluded.append("oss_fallback (OSS_INFERENCE_URL not set)")

    active.sort(key=lambda p: p.priority)

    logger.info(
        "[ProviderRegistry] Active providers (%d): %s",
        len(active),
        [p.name for p in active] or "NONE",
    )
    if excluded:
        logger.info("[ProviderRegistry] Excluded providers: %s", excluded)

    return active


# Built once at module import — all provider filtering happens here.
PROVIDER_REGISTRY: list[ProviderConfig] = _build_registry()


def get_active_providers() -> list[ProviderConfig]:
    """Return the active provider list, sorted by priority."""
    return PROVIDER_REGISTRY
