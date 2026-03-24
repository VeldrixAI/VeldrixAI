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


def _nim_models() -> list[str]:
    """
    Return the NIM models wired in this deployment.
    Always includes the five pillar env-var values if set,
    plus a baseline of common NIM-hosted models.
    """
    configured: set[str] = set()
    for var in (
        "VELDRIX_PILLAR_CONTENT_MODEL",
        "VELDRIX_PILLAR_HALLUCINATION_MODEL",
        "VELDRIX_PILLAR_BIAS_MODEL",
        "VELDRIX_PILLAR_POLICY_MODEL",
        "VELDRIX_PILLAR_LEGAL_MODEL",
    ):
        val = os.getenv(var)
        if val:
            configured.add(val)

    baseline = [
        "meta/llama-3.3-70b-instruct",
        "meta/llama-3.1-70b-instruct",
        "meta/llama-3.1-8b-instruct",
        "meta/llama-guard-4-12b",
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
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4-turbo",
                "gpt-4",
                "o3",
                "o3-mini",
                "o4-mini",
                "gpt-3.5-turbo",
            ],
        },
        {
            "provider": "Anthropic",
            "adapter": "anthropic",
            "models": [
                "claude-opus-4-5",
                "claude-sonnet-4-5",
                "claude-haiku-4-5",
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
            ],
        },
        {
            "provider": "Cohere",
            "adapter": "cohere",
            "models": [
                "command-a-03-2025",
                "command-r-plus",
                "command-r",
                "command-light",
            ],
        },
        {
            "provider": "Alibaba (Qwen)",
            "adapter": "qwen",
            "models": [
                "qwen-max",
                "qwen-plus",
                "qwen-turbo",
                "qwen2.5-72b-instruct",
                "qwen2.5-32b-instruct",
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
                "meta.llama3-1-70b-instruct-v1:0",
                "anthropic.claude-3-5-sonnet-20241022-v2:0",
            ],
        },
        {
            "provider": "Hugging Face",
            "adapter": "huggingface",
            "models": [
                "meta-llama/Llama-3.1-70B-Instruct",
                "meta-llama/Llama-3.1-8B-Instruct",
                "mistralai/Mistral-7B-Instruct-v0.3",
                "Qwen/Qwen2.5-72B-Instruct",
                "microsoft/Phi-3.5-mini-instruct",
            ],
        },
        {
            "provider": "Groq",
            "adapter": "openai",
            "models": [
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "mixtral-8x7b-32768",
                "gemma2-9b-it",
            ],
        },
        {
            "provider": "Together AI",
            "adapter": "openai",
            "models": [
                "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
                "mistralai/Mixtral-8x7B-Instruct-v0.1",
                "Qwen/Qwen2.5-72B-Instruct-Turbo",
            ],
        },
        {
            "provider": "Ollama (Local)",
            "adapter": "ollama",
            "models": [
                "llama3.3",
                "llama3.1",
                "mistral",
                "phi4",
                "qwen2.5",
                "gemma2",
                "codellama",
                "deepseek-r1",
            ],
        },
        {
            "provider": "OpenRouter",
            "adapter": "openai",
            "models": [
                "openai/gpt-4o",
                "anthropic/claude-3.5-sonnet",
                "meta-llama/llama-3.1-70b-instruct",
                "mistralai/mixtral-8x7b-instruct",
                "google/gemini-flash-1.5",
            ],
        },
        {
            "provider": "xAI",
            "adapter": "openai",
            "models": [
                "grok-3",
                "grok-3-mini",
                "grok-2",
                "grok-2-vision",
            ],
        },
        {
            "provider": "Microsoft",
            "adapter": "openai",
            "models": [
                "phi-4",
                "phi-4-mini",
                "phi-3.5-moe",
                "phi-3.5-mini",
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
