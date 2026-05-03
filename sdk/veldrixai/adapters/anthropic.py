"""Anthropic SDK — Messages API adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    messages = kwargs.get("messages", [])
    if not messages and args:
        messages = args[0] if isinstance(args[0], list) else []
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        return block["text"]
            return str(content)
    return None


def extract_response(result: Any) -> str:
    try:
        for block in result.content:
            if hasattr(block, "type"):
                if block.type == "text":
                    return block.text
                # tool_use block — Claude agent mode
                if block.type == "tool_use":
                    import json as _json
                    input_str = ""
                    try:
                        input_str = _json.dumps(block.input)[:500]
                    except Exception:
                        input_str = str(getattr(block, "input", ""))[:500]
                    return f"[tool_use:{getattr(block, 'name', 'unknown')}] {input_str}"
    except Exception:
        pass
    return str(result)
