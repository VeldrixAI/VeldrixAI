"""
Models registry endpoint — returns AI providers and their representative models.

The provider list is derived from the VeldrixAI SDK's supported adapters
(sdk/veldrixai/adapters/). The NVIDIA NIM section is augmented with the pillar
model IDs actually configured in this deployment via environment variables.
"""

from __future__ import annotations

import os
from fastapi import APIRouter, Depends
from src.core.middleware.auth import get_current_user

router = APIRouter(prefix="/api/models", tags=["models"])


# Default heavyweight pillar matrix — mirrors backend/core/src/config/pillar_models.py.
_PILLAR_MATRIX_DEFAULTS = [
    "meta/llama-guard-4-12b",                       # safety / content risk
    "nvidia/nemotron-3-ultra-550b-a55b",            # hallucination
    "mistralai/mistral-large-3-675b-instruct-2512", # bias & ethics
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",      # prompt security / policy
    "meta/llama-4-maverick-17b-128e-instruct",      # legal / compliance (405B retired from NIM)
]


def _nim_models() -> list[str]:
    """
    Return the NIM models wired in this deployment: the five-pillar heavyweight
    matrix (env-overridable via VELDRIX_PILLAR_MODEL__{PILLAR}__PRIMARY), plus
    a baseline of common NIM-hosted models.
    """
    configured: set[str] = set(_PILLAR_MATRIX_DEFAULTS)
    for pillar in ("SAFETY", "HALLUCINATION", "BIAS", "PROMPT_SECURITY", "COMPLIANCE"):
        val = os.getenv(f"VELDRIX_PILLAR_MODEL__{pillar}__PRIMARY")
        if val:
            configured.add(val)

    baseline = [
        "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "mistralai/mistral-medium-3-5-128b",
        "openai/gpt-oss-120b",
        "qwen/qwen3-235b-a22b",
        "meta/llama-4-maverick-17b-128e-instruct",
        "meta/llama-3.3-70b-instruct",
        "meta/llama-3.1-8b-instruct",
        "meta/llama-guard-3-8b",
        "google/gemma-3-27b-it",
    ]
    for m in baseline:
        configured.add(m)

    # Pillar-matrix models lead the list (the UI preselects the first entry);
    # remaining models follow alphabetically.
    pillar_first = [m for m in _PILLAR_MATRIX_DEFAULTS if m in configured]
    rest = sorted(configured - set(pillar_first))
    return pillar_first + rest


# ---------------------------------------------------------------------------
# Provider catalogue
# Each entry corresponds to an adapter in sdk/veldrixai/adapters/.
# Models reflect the current public model families for each provider.
# Ordering within a provider is newest-first: the UI preselects models[0].
# Last reviewed: 2026-07.
# ---------------------------------------------------------------------------
def _build_catalog() -> list[dict]:
    return [
        {
            "provider": "OpenAI",
            "adapter": "openai",
            "models": [
                "gpt-5.1",
                "gpt-5.1-codex",
                "gpt-5-pro",
                "gpt-5",
                "gpt-5-mini",
                "gpt-5-nano",
                "o4-mini",
                "gpt-4.1",
                "gpt-4o",
            ],
        },
        {
            "provider": "Anthropic",
            "adapter": "anthropic",
            "models": [
                "claude-fable-5",
                "claude-sonnet-5",
                "claude-opus-4-8",
                "claude-opus-4-7",
                "claude-sonnet-4-6",
                "claude-haiku-4-5-20251001",
            ],
        },
        {
            "provider": "Google DeepMind",
            "adapter": "google",
            "models": [
                "gemini-3-pro-preview",
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "gemini-2.5-flash-lite",
            ],
        },
        {
            "provider": "Meta",
            "adapter": "openai",
            "models": [
                "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
                "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                "meta-llama/Llama-3.3-70B-Instruct",
                "meta-llama/Llama-3.1-405B-Instruct",
            ],
        },
        {
            "provider": "Mistral AI",
            "adapter": "mistral",
            "models": [
                "mistral-large-latest",
                "mistral-medium-latest",
                "mistral-small-latest",
                "magistral-medium-latest",
                "magistral-small-latest",
                "codestral-latest",
                "devstral-medium-latest",
                "ministral-8b-latest",
            ],
        },
        {
            "provider": "DeepSeek",
            "adapter": "deepseek",
            "models": [
                "deepseek-chat",
                "deepseek-reasoner",
            ],
        },
        {
            "provider": "Cohere",
            "adapter": "cohere",
            "models": [
                "command-a-03-2025",
                "command-a-reasoning-08-2025",
                "command-a-vision-07-2025",
                "command-r-plus-08-2024",
                "command-r7b-12-2024",
            ],
        },
        {
            "provider": "Alibaba (Qwen)",
            "adapter": "qwen",
            "models": [
                "qwen3-max",
                "qwen3-235b-a22b-instruct-2507",
                "qwen3-coder-plus",
                "qwen-plus",
                "qwen-flash",
                "qwq-32b",
            ],
        },
        {
            "provider": "NVIDIA NIM",
            "adapter": "openai",
            "models": _nim_models(),
        },
        {
            "provider": "AWS Bedrock",
            "adapter": "aws_bedrock",
            "models": [
                "amazon.nova-premier-v1:0",
                "amazon.nova-pro-v1:0",
                "amazon.nova-lite-v1:0",
                "amazon.nova-micro-v1:0",
                "anthropic.claude-sonnet-4-5-20250929-v1:0",
                "anthropic.claude-haiku-4-5-20251001-v1:0",
                "meta.llama4-maverick-17b-instruct-v1:0",
                "meta.llama4-scout-17b-instruct-v1:0",
            ],
        },
        {
            "provider": "Hugging Face",
            "adapter": "huggingface",
            "models": [
                "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
                "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                "meta-llama/Llama-3.3-70B-Instruct",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "Qwen/Qwen3-235B-A22B-Instruct-2507",
                "deepseek-ai/DeepSeek-V3.1",
                "microsoft/Phi-4",
            ],
        },
        {
            "provider": "Groq",
            "adapter": "openai",
            "models": [
                "meta-llama/llama-4-maverick-17b-128e-instruct",
                "meta-llama/llama-4-scout-17b-16e-instruct",
                "moonshotai/kimi-k2-instruct",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3-32b",
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
            ],
        },
        {
            "provider": "Together AI",
            "adapter": "openai",
            "models": [
                "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
                "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                "deepseek-ai/DeepSeek-V3.1",
                "Qwen/Qwen3-235B-A22B-Instruct-2507-tput",
                "openai/gpt-oss-120b",
                "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            ],
        },
        {
            "provider": "Ollama (Local)",
            "adapter": "ollama",
            "models": [
                "llama4",
                "llama3.3",
                "gpt-oss",
                "qwen3",
                "gemma3",
                "phi4",
                "deepseek-r1",
                "mistral-small3.2",
                "devstral",
            ],
        },
        {
            "provider": "OpenRouter",
            "adapter": "openai",
            "models": [
                "openai/gpt-5.1",
                "anthropic/claude-sonnet-5",
                "anthropic/claude-opus-4.8",
                "google/gemini-3-pro-preview",
                "x-ai/grok-4.1",
                "deepseek/deepseek-chat-v3.1",
                "meta-llama/llama-4-maverick",
                "qwen/qwen3-235b-a22b-2507",
                "mistralai/mistral-large",
            ],
        },
        {
            "provider": "xAI",
            "adapter": "openai",
            "models": [
                "grok-4-1",
                "grok-4-1-fast",
                "grok-4",
                "grok-4-fast",
                "grok-code-fast-1",
                "grok-3-mini",
            ],
        },
        {
            "provider": "Microsoft Azure",
            "adapter": "openai",
            "models": [
                "phi-4",
                "phi-4-reasoning",
                "phi-4-mini",
                "phi-4-mini-reasoning",
                "phi-4-multimodal",
                "MAI-1-preview",
            ],
        },
    ]


@router.get("/providers")
async def list_providers(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """
    Returns all AI providers supported by the VeldrixAI SDK with their
    available model identifiers. The NVIDIA NIM section reflects models
    configured via environment variables in this deployment.
    """
    return _build_catalog()
