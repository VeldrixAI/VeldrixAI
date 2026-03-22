"""OpenAI SDK ChatCompletion adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    messages = kwargs.get("messages", [])
    if not messages and args:
        messages = args[0] if isinstance(args[0], list) else []
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):   # vision: content is list of parts
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        return part["text"]
            return content
    return None


def extract_response(result: Any) -> str:
    try:
        return result.choices[0].message.content or ""
    except (AttributeError, IndexError):
        return str(result)
