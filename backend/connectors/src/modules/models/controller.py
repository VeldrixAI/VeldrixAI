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
    "meta/llama-3.1-405b-instruct",                 # legal / compliance
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
        "meta/llama-3.3-70b-instruct",
        "meta/llama-3.1-70b-instruct",
        "meta/llama-3.1-8b-instruct",
        "meta/llama-guard-3-8b",
        "mistralai/mixtral-8x7b-instruct",
        "mistralai/mistral-7b-instruct-v0.3",
        "microsoft/phi-3-medium-128k-instruct",
        "google/gemma-2-27b-it",
    ]
    for m in baseline:
        configured.add(m)

    return sorted(configured)


# ---------------------------------------------------------------------------
# Provider catalogue
# Each entry corresponds to an adapter in sdk/veldrixai/adapters/.
# Models reflect the current public model families for each provider.
# ---------------------------------------------------------------------------
def _build_catalog() -> list[dict]:
    return [
        {
            "provider": "OpenAI",
            "adapter": "openai",
            "models": [
                "gpt-4.1",
                "gpt-4.1-mini",
                "gpt-4.1-nano",
                "gpt-4o",
                "gpt-4o-mini",
                "o4-mini",
                "o3",
                "o3-mini",
                "gpt-4-turbo",
                "gpt-3.5-turbo",
            ],
        },
        {
            "provider": "Anthropic",
            "adapter": "anthropic",
            "models": [
                "claude-opus-4-7",
                "claude-sonnet-4-6",
                "claude-haiku-4-5-20251001",
                "claude-opus-4",
                "claude-sonnet-4",
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-20240229",
            ],
        },
        {
            "provider": "Google DeepMind",
            "adapter": "google",
            "models": [
                "gemini-2.5-pro-preview-05-06",
                "gemini-2.5-flash-preview-04-17",
                "gemini-2.0-flash",
                "gemini-2.0-flash-lite",
                "gemini-2.0-pro-exp",
                "gemini-1.5-pro",
                "gemini-1.5-flash",
                "gemini-1.5-flash-8b",
            ],
        },
        {
            "provider": "Meta",
            "adapter": "openai",
            "models": [
                "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
                "meta-llama/Llama-3.3-70B-Instruct",
                "meta-llama/Llama-3.1-405B-Instruct",
                "meta-llama/Llama-3.1-70B-Instruct",
                "meta-llama/Llama-3.2-90B-Vision-Instruct",
            ],
        },
        {
            "provider": "Mistral AI",
            "adapter": "mistral",
            "models": [
                "mistral-large-latest",
                "mistral-medium-latest",
                "mistral-small-latest",
                "mistral-saba-latest",
                "codestral-latest",
                "pixtral-large-latest",
                "ministral-8b-latest",
                "ministral-3b-latest",
            ],
        },
        {
            "provider": "DeepSeek",
            "adapter": "deepseek",
            "models": [
                "deepseek-chat",
                "deepseek-reasoner",
                "deepseek-v3",
                "deepseek-r1",
            ],
        },
        {
            "provider": "Cohere",
            "adapter": "cohere",
            "models": [
                "command-a-03-2025",
                "command-r-plus-08-2024",
                "command-r-08-2024",
                "command-r-plus",
                "command-r",
                "command-light",
            ],
        },
        {
            "provider": "Alibaba (Qwen)",
            "adapter": "qwen",
            "models": [
                "qwen-max-2025-01-25",
                "qwen-max",
                "qwen-plus",
                "qwen-turbo",
                "qwq-32b",
                "qwen2.5-72b-instruct",
                "qwen2.5-32b-instruct",
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
                "anthropic.claude-3-5-sonnet-20241022-v2:0",
                "anthropic.claude-3-5-haiku-20241022-v1:0",
                "meta.llama3-3-70b-instruct-v1:0",
                "meta.llama3-1-70b-instruct-v1:0",
            ],
        },
        {
            "provider": "Hugging Face",
            "adapter": "huggingface",
            "models": [
                "meta-llama/Llama-3.3-70B-Instruct",
                "meta-llama/Llama-3.1-70B-Instruct",
                "meta-llama/Llama-3.1-8B-Instruct",
                "mistralai/Mistral-7B-Instruct-v0.3",
                "Qwen/Qwen2.5-72B-Instruct",
                "microsoft/Phi-4",
                "microsoft/Phi-3.5-mini-instruct",
            ],
        },
        {
            "provider": "Groq",
            "adapter": "openai",
            "models": [
                "meta-llama/llama-4-scout-17b-16e-instruct",
                "meta-llama/llama-4-maverick-17b-128e-instruct",
                "llama-3.3-70b-versatile",
                "llama-3.1-70b-versatile",
                "llama-3.1-8b-instant",
                "gemma2-9b-it",
                "mixtral-8x7b-32768",
            ],
        },
        {
            "provider": "Together AI",
            "adapter": "openai",
            "models": [
                "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
                "Qwen/Qwen2.5-72B-Instruct-Turbo",
                "mistralai/Mixtral-8x7B-Instruct-v0.1",
            ],
        },
        {
            "provider": "Ollama (Local)",
            "adapter": "ollama",
            "models": [
                "llama3.3",
                "llama3.2",
                "llama3.1",
                "phi4",
                "phi4-mini",
                "qwen2.5",
                "gemma3",
                "mistral",
                "deepseek-r1",
                "codellama",
            ],
        },
        {
            "provider": "OpenRouter",
            "adapter": "openai",
            "models": [
                "openai/gpt-4.1",
                "openai/gpt-4o",
                "anthropic/claude-opus-4",
                "anthropic/claude-sonnet-4",
                "anthropic/claude-3.5-sonnet",
                "google/gemini-2.5-pro-preview",
                "meta-llama/llama-4-scout",
                "meta-llama/llama-3.1-70b-instruct",
                "mistralai/mistral-large",
                "deepseek/deepseek-chat",
            ],
        },
        {
            "provider": "xAI",
            "adapter": "openai",
            "models": [
                "grok-3",
                "grok-3-mini",
                "grok-3-fast",
                "grok-2-1212",
                "grok-2-vision-1212",
            ],
        },
        {
            "provider": "Microsoft Azure",
            "adapter": "openai",
            "models": [
                "phi-4",
                "phi-4-mini",
                "phi-4-multimodal",
                "phi-3.5-moe-instruct",
                "phi-3.5-mini-instruct",
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
