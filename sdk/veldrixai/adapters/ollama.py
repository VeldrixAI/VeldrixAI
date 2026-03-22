"""Ollama local adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    messages = kwargs.get("messages", [])
    if not messages and args:
        messages = args[0] if isinstance(args[0], list) else []
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return msg.get("content", "")
    if "prompt" in kwargs:
        return kwargs["prompt"]
    return None


def extract_response(result: Any) -> str:
    if isinstance(result, dict):
        msg = result.get("message", {})
        if isinstance(msg, dict):
            return msg.get("content", "")
        return result.get("response", str(result))
    return str(result)
