"""Google Gemini / Vertex AI adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    contents = kwargs.get("contents") or (args[0] if args else None)
    if isinstance(contents, str):
        return contents
    if isinstance(contents, list):
        for item in reversed(contents):
            if isinstance(item, str):
                return item
            if isinstance(item, dict) and item.get("role") == "user":
                parts = item.get("parts", [])
                for p in parts:
                    if isinstance(p, str):
                        return p
                    if isinstance(p, dict) and "text" in p:
                        return p["text"]
    return None


def extract_response(result: Any) -> str:
    try:
        return result.text
    except Exception:
        pass
    try:
        return result.candidates[0].content.parts[0].text
    except Exception:
        pass
    return str(result)
