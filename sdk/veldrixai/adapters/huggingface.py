"""Hugging Face Inference API adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    if "prompt" in kwargs:
        return kwargs["prompt"]
    messages = kwargs.get("messages", [])
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return msg.get("content", "")
    if args and isinstance(args[0], str):
        return args[0]
    return None


def extract_response(result: Any) -> str:
    if isinstance(result, str):
        return result
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            return first.get("generated_text", str(first))
    try:
        return result.choices[0].message.content
    except Exception:
        pass
    return str(result)
