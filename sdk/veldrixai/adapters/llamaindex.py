"""LlamaIndex adapter."""
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    if args and isinstance(args[0], str):
        return args[0]
    if "message" in kwargs:
        return kwargs["message"]
    if "str_or_query_bundle" in kwargs:
        qb = kwargs["str_or_query_bundle"]
        return str(qb) if isinstance(qb, str) else getattr(qb, "query_str", str(qb))
    return None


def extract_response(result: Any) -> str:
    try:
        return str(result.response)
    except Exception:
        pass
    try:
        return result.message.content
    except Exception:
        pass
    return str(result)
