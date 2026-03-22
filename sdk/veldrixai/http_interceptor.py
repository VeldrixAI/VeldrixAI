"""
VeldrixAI Global HTTP Interceptor
─────────────────────────────────
Monkey-patches httpx.AsyncClient and requests.Session so that ANY HTTP call
to any known AI endpoint is automatically captured and evaluated.

Usage:
    import veldrixai
    veldrix = veldrixai.Veldrix(api_key="vx-live-...")
    enable_global_intercept(veldrix)   # All AI calls now go through VeldrixAI.
"""

from __future__ import annotations
import json
import logging
import asyncio
import threading as _threading
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from veldrixai.client import Veldrix

logger = logging.getLogger("veldrix.interceptor.http")

_VELDRIX_INSTANCE: Optional["Veldrix"] = None
_PATCHED    = False
_PATCH_LOCK = _threading.Lock()   # prevents double-patching under concurrent startup


def enable_global_intercept(veldrix_instance: "Veldrix") -> None:
    """Called by the developer after creating a Veldrix client. Patches httpx and requests once. Idempotent."""
    global _VELDRIX_INSTANCE, _PATCHED
    _VELDRIX_INSTANCE = veldrix_instance

    with _PATCH_LOCK:               # atomic check-and-patch — safe under concurrent startup
        if _PATCHED:
            return
        _patch_httpx()
        _patch_requests()
        _PATCHED = True

    logger.info("VeldrixAI global HTTP interceptor enabled — all AI endpoints monitored")


def disable_global_intercept() -> None:
    """Restore original HTTP clients. Useful in tests."""
    global _PATCHED
    _unpatch_httpx()
    _unpatch_requests()
    _PATCHED = False
    logger.info("VeldrixAI global HTTP interceptor disabled")


_original_httpx_send: Any = None
_original_httpx_async_send: Any = None


def _patch_httpx() -> None:
    global _original_httpx_send, _original_httpx_async_send
    try:
        import httpx
        from veldrixai.providers import is_ai_endpoint, match_provider

        _original_httpx_send       = httpx.Client.send
        _original_httpx_async_send = httpx.AsyncClient.send

        def _sync_send(self, request: httpx.Request, **kwargs):
            response = _original_httpx_send(self, request, **kwargs)
            _handle_sync(request, response)
            return response

        async def _async_send(self, request: httpx.Request, **kwargs):
            response = await _original_httpx_async_send(self, request, **kwargs)
            await _handle_async(request, response)
            return response

        httpx.Client.send       = _sync_send
        httpx.AsyncClient.send  = _async_send
        logger.debug("httpx patched")
    except ImportError:
        logger.debug("httpx not installed — skipping httpx patch")


def _unpatch_httpx() -> None:
    global _original_httpx_send, _original_httpx_async_send
    try:
        import httpx
        if _original_httpx_send:
            httpx.Client.send      = _original_httpx_send
        if _original_httpx_async_send:
            httpx.AsyncClient.send = _original_httpx_async_send
    except ImportError:
        pass


_original_requests_send: Any = None


def _patch_requests() -> None:
    global _original_requests_send
    try:
        import requests
        from veldrixai.providers import is_ai_endpoint

        _original_requests_send = requests.Session.send

        def _patched_send(self, request, **kwargs):
            response = _original_requests_send(self, request, **kwargs)
            _handle_sync_requests(request, response)
            return response

        requests.Session.send = _patched_send
        logger.debug("requests patched")
    except ImportError:
        logger.debug("requests not installed — skipping requests patch")


def _unpatch_requests() -> None:
    global _original_requests_send
    try:
        import requests
        if _original_requests_send:
            requests.Session.send = _original_requests_send
    except ImportError:
        pass


def _safe_create_task(coro) -> None:
    """
    Schedules a coroutine as a background task if a running event loop exists.
    Falls back to a daemon thread if no loop is running.
    Never raises. Never blocks.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        # No running event loop — run in a daemon thread instead
        def _run_in_thread():
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(coro)
            except Exception as e:
                logger.debug("Fallback thread eval failed (non-fatal): %s", e)
            finally:
                try:
                    new_loop.close()
                except Exception:
                    pass

        _threading.Thread(target=_run_in_thread, daemon=True).start()
    except Exception as e:
        logger.debug("_safe_create_task failed (non-fatal): %s", e)


def _handle_sync(request: Any, response: Any) -> None:
    try:
        from veldrixai.providers import match_provider
        url      = str(request.url)
        provider = match_provider(url)
        if not provider:
            return

        prompt, resp_text = _extract_from_httpx(request, response, provider)
        if not prompt and not resp_text:
            return

        def _run():
            try:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    _VELDRIX_INSTANCE.evaluate(
                        prompt=prompt or "",
                        response=resp_text or "",
                    )
                )
                loop.close()
            except Exception as e:
                logger.debug("HTTP intercept eval failed: %s", e)
        _threading.Thread(target=_run, daemon=True).start()

    except Exception as e:
        logger.debug("HTTP intercept sync handler error: %s", e)


async def _handle_async(request: Any, response: Any) -> None:
    try:
        from veldrixai.providers import match_provider
        url      = str(request.url)
        provider = match_provider(url)
        if not provider:
            return

        prompt, resp_text = _extract_from_httpx(request, response, provider)
        if not prompt and not resp_text:
            return

        _safe_create_task(
            _VELDRIX_INSTANCE.evaluate(
                prompt=prompt or "",
                response=resp_text or "",
            )
        )
    except Exception as e:
        logger.debug("HTTP intercept async handler error: %s", e)


def _handle_sync_requests(request: Any, response: Any) -> None:
    try:
        from veldrixai.providers import match_provider
        url      = request.url
        provider = match_provider(url)
        if not provider:
            return

        prompt   = _extract_prompt_from_body(request.body)
        resp_txt = _extract_response_text(response.text)

        if not prompt and not resp_txt:
            return

        def _run():
            try:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    _VELDRIX_INSTANCE.evaluate(
                        prompt=prompt or "",
                        response=resp_txt or "",
                    )
                )
                loop.close()
            except Exception as e:
                logger.debug("requests intercept eval failed: %s", e)
        _threading.Thread(target=_run, daemon=True).start()

    except Exception as e:
        logger.debug("requests intercept handler error: %s", e)


def _extract_from_httpx(request: Any, response: Any, provider: Any):
    try:
        body      = request.content
        body_dict = json.loads(body) if body else {}
        prompt    = _extract_prompt_from_body(body_dict)
        resp_text = _extract_response_text_from_httpx(response)
        return prompt, resp_text
    except Exception:
        return None, None


def _extract_prompt_from_body(body: Any) -> Optional[str]:
    if isinstance(body, (bytes, str)):
        try:
            body = json.loads(body)
        except Exception:
            return str(body)[:500] if body else None

    if not isinstance(body, dict):
        return None

    messages = body.get("messages", [])
    if messages:
        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            return part["text"]
                return str(content)

    if "prompt" in body:
        return body["prompt"]
    if "message" in body:
        return body["message"]
    for key in ("inputText", "input", "query", "text", "content"):
        if key in body:
            val = body[key]
            if isinstance(val, str):
                return val

    return None


def _extract_response_text_from_httpx(response: Any) -> Optional[str]:
    return _extract_response_text(response.text)


def _extract_response_text(text: str) -> Optional[str]:
    if not text:
        return None
    try:
        data = json.loads(text)
    except Exception:
        return text[:2000] if len(text) < 5000 else None

    choices = data.get("choices", [])
    if choices:
        c = choices[0]
        if isinstance(c, dict):
            msg = c.get("message", {})
            if isinstance(msg, dict):
                return msg.get("content") or msg.get("text")
            return c.get("text") or c.get("content")

    content = data.get("content", [])
    if isinstance(content, list) and content:
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text")

    if "text" in data:
        return data["text"]
    if "generations" in data:
        return data["generations"][0].get("text") if data["generations"] else None

    for key in ("outputText", "output", "response", "result", "answer"):
        if key in data and isinstance(data[key], str):
            return data[key]

    return None
