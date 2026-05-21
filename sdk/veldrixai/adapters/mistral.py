"""Mistral AI SDK adapter."""
from typing import Any


def extract_response(result: Any) -> str:
    try:
        return result.choices[0].message.content or ""
    except Exception:
        return str(result)
