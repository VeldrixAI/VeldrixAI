"""Cohere SDK adapter — supports v1 (NonStreamedChatResponse) and v2 (ChatResponse)."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    msg = kwargs.get("message") or (args[0] if args else None)
    if isinstance(msg, str):
        return msg
    # Cohere v2 messages=[{"role": "user", "content": "..."}]
    messages = kwargs.get("messages", [])
    if messages:
        for m in reversed(messages):
            if isinstance(m, dict) and m.get("role") == "user":
                return str(m.get("content", ""))
    return None


def extract_response(result: Any) -> str:
    # Cohere v1: result.text (NonStreamedChatResponse / Generation)
    try:
        text = result.text
        if isinstance(text, str):
            return text
    except Exception:
        pass

    # Cohere v2: result.message.content[0].text (ChatResponse)
    try:
        content = result.message.content
        if isinstance(content, list) and content:
            block = content[0]
            # SDK object with .text attribute
            if hasattr(block, "text") and isinstance(block.text, str):
                return block.text
            # dict form
            if isinstance(block, dict) and "text" in block:
                return block["text"]
    except Exception:
        pass

    # Cohere v2 alt: result.message is a plain string in some SDK versions
    try:
        msg = result.message
        if isinstance(msg, str):
            return msg
    except Exception:
        pass

    return str(result)
