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
    # Tool call / function call response — agent mode
    try:
        choice = result.choices[0]
        # finish_reason == "tool_calls" means the model called a tool, not text
        if getattr(choice, "finish_reason", None) == "tool_calls":
            tool_calls = getattr(choice.message, "tool_calls", None) or []
            parts = []
            for tc in tool_calls:
                fn = getattr(tc, "function", None)
                if fn:
                    parts.append(f"[tool_call:{getattr(fn, 'name', 'unknown')}] {getattr(fn, 'arguments', '')[:500]}")
            return " | ".join(parts) if parts else "[tool_call]"
        return choice.message.content or ""
    except (AttributeError, IndexError):
        return str(result)
