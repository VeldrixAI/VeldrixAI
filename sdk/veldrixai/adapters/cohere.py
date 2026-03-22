"""Cohere SDK adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    msg = kwargs.get("message") or (args[0] if args else None)
    if isinstance(msg, str):
        return msg
    return None


def extract_response(result: Any) -> str:
    try:
        return result.text
    except Exception:
        pass
    try:
        return result.message
    except Exception:
        pass
    return str(result)
