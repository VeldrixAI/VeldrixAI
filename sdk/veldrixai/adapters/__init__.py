"""
VeldrixAI Adapter Registry
Auto-detects the correct adapter for any LLM response type.
"""

from __future__ import annotations
from typing import Any, Callable, Optional, Tuple

__all__ = ["get_adapter"]


def get_adapter(result: Any) -> Tuple[Callable, Callable]:
    """
    Returns (extract_prompt_fn, extract_response_fn) for the given result type.
    """
    type_name = type(result).__name__
    module    = type(result).__module__ or ""

    if "openai" in module and hasattr(result, "choices"):
        from veldrixai.adapters.openai import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "anthropic" in module or type_name in ("Message", "TextBlock"):
        from veldrixai.adapters.anthropic import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "google" in module or "generativelanguage" in module or type_name == "GenerateContentResponse":
        from veldrixai.adapters.google import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "cohere" in module or type_name in ("NonStreamedChatResponse", "Generation"):
        from veldrixai.adapters.cohere import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "mistral" in module or type_name == "ChatCompletionResponse":
        from veldrixai.adapters.mistral import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "litellm" in module or type_name == "ModelResponse":
        from veldrixai.adapters.litellm import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "langchain" in module or type_name in ("AIMessage", "HumanMessage", "ChatMessage"):
        from veldrixai.adapters.langchain import extract_prompt, extract_response
        return extract_prompt, extract_response

    if "llama_index" in module or "llama-index" in module or type_name == "Response":
        from veldrixai.adapters.llamaindex import extract_prompt, extract_response
        return extract_prompt, extract_response

    if isinstance(result, dict) and "message" in result and "model" in result:
        from veldrixai.adapters.ollama import extract_prompt, extract_response
        return extract_prompt, extract_response

    if isinstance(result, dict) and "ResponseMetadata" in result:
        from veldrixai.adapters.aws_bedrock import extract_prompt, extract_response
        return extract_prompt, extract_response

    from veldrixai.adapters.generic import extract_prompt, extract_response
    return extract_prompt, extract_response
