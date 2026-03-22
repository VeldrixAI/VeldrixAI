"""Mistral AI SDK adapter."""
from typing import Any, Optional
from veldrixai.adapters.openai import extract_prompt


def extract_response(result: Any) -> str:
    try:
        return result.choices[0].message.content or ""
    except Exception:
        return str(result)
