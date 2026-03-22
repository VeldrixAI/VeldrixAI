"""LangChain adapter — handles invoke(), __call__(), and chain outputs."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    # LangChain chain.invoke({"input": "..."}) pattern
    if args and isinstance(args[0], dict):
        for key in ("input", "question", "query", "human_input", "user_input"):
            if key in args[0]:
                return args[0][key]
    # Direct string invoke
    if args and isinstance(args[0], str):
        return args[0]
    if "input" in kwargs:
        return kwargs["input"]
    return None


def extract_response(result: Any) -> str:
    # Chain output dict
    if isinstance(result, dict):
        for key in ("output", "answer", "result", "text", "content", "response"):
            if key in result:
                return str(result[key])
        return str(result)
    # AIMessage / BaseMessage
    if hasattr(result, "content"):
        return result.content or ""
    return str(result)
