"""
Generic adapter — fallback for str, dict, and unknown return types.
Extracts prompt from the args/kwargs of the decorated function.
"""

from typing import Any, Optional
from veldrixai.models import _extract_content


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    """
    Attempts to find the user prompt from the function call arguments.
    Handles the most common LLM call signatures.
    """
    # Pattern 1: messages=[{"role": "user", "content": "..."}]
    messages = kwargs.get("messages") or (args[0] if args else None)
    if isinstance(messages, list):
        # Find the last user message
        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get("role") == "user":
                return msg.get("content", "")
            # LangChain HumanMessage
            if hasattr(msg, "content") and hasattr(msg, "type"):
                if getattr(msg, "type", "") == "human":
                    return msg.content
        # Fallback: last message regardless of role
        last = messages[-1]
        if isinstance(last, dict):
            return last.get("content", str(last))
        if hasattr(last, "content"):
            return last.content

    # Pattern 2: prompt="..."
    if "prompt" in kwargs:
        return kwargs["prompt"]

    # Pattern 3: first string arg
    if args and isinstance(args[0], str):
        return args[0]

    return None


def extract_response(result: Any) -> str:
    return _extract_content(result)
