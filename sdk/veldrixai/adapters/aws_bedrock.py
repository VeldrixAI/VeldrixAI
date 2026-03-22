"""AWS Bedrock adapter — handles multiple model families."""
import json
from typing import Any, Optional


def extract_prompt(args: tuple, kwargs: dict) -> Optional[str]:
    body = kwargs.get("body") or (args[1] if len(args) > 1 else None)
    if isinstance(body, (bytes, str)):
        try:
            body = json.loads(body)
        except Exception:
            return str(body)[:500]
    if isinstance(body, dict):
        msgs = body.get("messages", [])
        if msgs:
            for m in reversed(msgs):
                if isinstance(m, dict) and m.get("role") == "user":
                    return str(m.get("content", ""))
        if "inputText" in body:
            return body["inputText"]
        if "prompt" in body:
            return body["prompt"]
        if "message" in body:
            return body["message"]
    return None


def extract_response(result: Any) -> str:
    try:
        body = result.get("body")
        if hasattr(body, "read"):
            body = body.read()
        data = json.loads(body)
        if "content" in data:
            for block in data["content"]:
                if block.get("type") == "text":
                    return block["text"]
        if "results" in data:
            return data["results"][0].get("outputText", "")
        if "generation" in data:
            return data["generation"]
        if "text" in data:
            return data["text"]
        return json.dumps(data)[:2000]
    except Exception:
        return str(result)[:500]
