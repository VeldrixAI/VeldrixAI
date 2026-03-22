"""Alibaba Qwen / Dashscope adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    messages = kwargs.get("messages", [])
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return msg.get("content", "")
    input_data = kwargs.get("input", {})
    if isinstance(input_data, dict):
        msgs = input_data.get("messages", [])
        for msg in reversed(msgs):
            if msg.get("role") == "user":
                return msg.get("content", "")
        if "prompt" in input_data:
            return input_data["prompt"]
    return None


def extract_response(result: Any) -> str:
    try:
        return result.choices[0].message.content
    except Exception:
        pass
    try:
        return result.output.choices[0].message.content
    except Exception:
        pass
    return str(result)
