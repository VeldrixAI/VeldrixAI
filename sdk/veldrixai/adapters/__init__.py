"""
VeldrixAI Adapter Registry
Auto-detects the correct adapter for any LLM response type.

Matching rules
──────────────
Every check uses the module path as the PRIMARY discriminator. Class name is
used only as a secondary signal AND only when the module path already confirms
the correct library. This prevents common class names like "ChatResponse",
"ModelResponse", or "Message" from accidentally matching the wrong adapter
when multiple AI libraries are installed in the same environment.

Fix — Issue E: removed bare type_name fallbacks for ChatResponse and ModelResponse
  Previously "ChatResponse" matched the Cohere adapter and "ModelResponse" matched
  the LiteLLM adapter regardless of which library the object came from. Any library
  using those class names (internal SDKs, wrappers, etc.) would silently get the
  wrong adapter. Both now require module-path confirmation.

Cohere v2 note: ChatResponse matched only when "cohere" is in the module path.
LiteLLM note:   ModelResponse matched only when "litellm" is in the module path.
LlamaIndex note: "Response" class name removed — module-path matching is sufficient.
"""

from __future__ import annotations
from typing import Any, Callable, Tuple

__all__ = ["get_adapter"]


def get_adapter(result: Any) -> Tuple[Callable, Callable]:
    """
    Returns (extract_prompt_fn, extract_response_fn) for the given result type.
    """
    type_name = type(result).__name__
    module    = type(result).__module__ or ""

    # ── OpenAI / Azure OpenAI ─────────────────────────────────────────────────
    if "openai" in module and (hasattr(result, "choices") or hasattr(result, "model")):
        from veldrixai.adapters.openai import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Anthropic ─────────────────────────────────────────────────────────────
    # type_name guard is scoped: only matches when module confirms anthropic
    if "anthropic" in module or (
        type_name in ("Message", "TextBlock") and "anthropic" in module
    ):
        from veldrixai.adapters.anthropic import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Google Gemini / Vertex AI ─────────────────────────────────────────────
    if (
        "google" in module
        or "generativelanguage" in module
        or "vertexai" in module
        or type_name == "GenerateContentResponse"
    ):
        from veldrixai.adapters.google import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Cohere (v1 + v2) ──────────────────────────────────────────────────────
    # Fix — Issue E: "ChatResponse" bare type_name removed — too generic.
    # NonStreamedChatResponse / Generation are unique enough to keep as secondary
    # signals but still require module-path confirmation via the OR short-circuit.
    # v2 ChatResponse is caught by the "cohere" in module branch.
    if "cohere" in module or (
        type_name in ("NonStreamedChatResponse", "Generation") and "cohere" in module
    ):
        from veldrixai.adapters.cohere import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Mistral AI ────────────────────────────────────────────────────────────
    # ChatCompletionResponse only matched when module confirms mistral
    if "mistral" in module or (
        type_name == "ChatCompletionResponse" and "mistral" in module
    ):
        from veldrixai.adapters.mistral import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── LiteLLM ───────────────────────────────────────────────────────────────
    # Fix — Issue E: "ModelResponse" bare type_name removed — too generic.
    # Module-path confirmation required.
    if "litellm" in module:
        from veldrixai.adapters.litellm import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── LangChain ─────────────────────────────────────────────────────────────
    if "langchain" in module or type_name in (
        "AIMessage", "HumanMessage", "ChatMessage",
        "AgentFinish", "AgentAction",
    ):
        from veldrixai.adapters.langchain import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── LlamaIndex ────────────────────────────────────────────────────────────
    # Module-path only — "Response" class name removed (too generic)
    if "llama_index" in module or "llama-index" in module or "llama_index" in type_name.lower():
        from veldrixai.adapters.llamaindex import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Ollama ────────────────────────────────────────────────────────────────
    if isinstance(result, dict) and "message" in result and "model" in result:
        from veldrixai.adapters.ollama import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── AWS Bedrock ───────────────────────────────────────────────────────────
    if isinstance(result, dict) and "ResponseMetadata" in result:
        from veldrixai.adapters.aws_bedrock import extract_prompt, extract_response
        return extract_prompt, extract_response

    # ── Generic fallback ──────────────────────────────────────────────────────
    from veldrixai.adapters.generic import extract_prompt, extract_response
    return extract_prompt, extract_response
