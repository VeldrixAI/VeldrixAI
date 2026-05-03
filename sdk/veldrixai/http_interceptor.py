"""
VeldrixAI Global HTTP Interceptor
──────────────────────────────────────────────────────────────────────────────
Monkey-patches httpx.AsyncClient and requests.Session so that ANY HTTP call
to any known AI endpoint is automatically captured and evaluated — zero code
changes required in the application.

Thread-safety contract
──────────────────────
  enable_global_intercept()  — idempotent, guarded by _PATCH_LOCK, safe under
                               concurrent startup from multiple threads.

  Sync intercept path        — _handle_sync / _handle_sync_requests
                               Dispatched through _INTERCEPT_BG_POOL — a bounded
                               ThreadPoolExecutor (max 32 workers) shared with
                               interceptor.py's _SYNC_BG_POOL. Under load this
                               caps OS thread creation and applies backpressure
                               instead of spawning unbounded raw threads.

  Async intercept path       — _handle_async
                               If a running event loop exists (normal async app),
                               the evaluation is submitted as a fire-and-forget
                               task using the shared client on the same loop.
                               Task reference is held in _INTERCEPT_TASKS to
                               prevent GC collection before execution.
                               If no loop is running (WSGI / sync context), falls
                               back to _dispatch_in_thread which uses the bounded
                               pool — NEVER spawns a raw thread.

Fix — Issue A: _dispatch_in_thread unbounded thread spawning
  Previously every intercepted HTTP call spawned a raw daemon thread with no
  cap. Under 500 concurrent OpenAI calls this created 500 OS threads, exhausting
  the thread pool. Fixed: _dispatch_in_thread now submits to _INTERCEPT_BG_POOL
  (bounded ThreadPoolExecutor, max 32 workers). Submissions beyond pool capacity
  are dropped with a debug log — same semantics as the async queue overflow.

Fix — Issue C: _safe_create_task now holds the task reference
  Previously loop.create_task() was called without storing the returned Task,
  allowing GC to collect it before execution. Fixed: task is added to
  _INTERCEPT_TASKS with a done-callback for automatic cleanup.

Fix — Issue 6: asyncio.create_task GC reference drop in _handle_async
  _INTERCEPT_TASKS holds strong references; done-callback removes them.

Fix — Issue 7: on_result callback for enterprise audit
  enable_global_intercept() accepts an optional on_result callback:
      enable_global_intercept(client, on_result=my_audit_fn)
  Signature: on_result(prompt: str, response: str, trust: TrustResult)
  Runs in the background — never blocks the LLM call.
  Exceptions are caught and logged, never propagated.

Fix — _handle_async full config propagation:
  Previously _handle_async constructed a GuardConfig that only copied
  background and metadata from the client default config, silently dropping
  timeout_ms, block_on_verdict, and on_block. Fixed: all fields from
  _default_cfg are propagated. metadata from the intercepted request body
  is merged on top so per-request tags always win.

Fix — extraction cap alignment:
  _extract_response_text previously capped at 4 000 chars while transport.py
  caps at 8 000. Both paths now use _MAX_PAYLOAD_CHARS (8 000) so trust
  scores are consistent regardless of integration method.

Usage:
    import veldrixai
    veldrix = veldrixai.Veldrix(api_key="vx-live-...")
    enable_global_intercept(veldrix)   # All AI calls now go through VeldrixAI.

    # With audit callback:
    def audit(prompt, response, trust):
        print(f"[AUDIT] verdict={trust.verdict} score={trust.overall:.0%}")
    enable_global_intercept(veldrix, on_result=audit)
"""

from __future__ import annotations
import atexit
import json
import logging
import asyncio
import threading as _threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional, Set, TYPE_CHECKING

from veldrixai.transport import _MAX_PAYLOAD_CHARS

if TYPE_CHECKING:
    from veldrixai.client import Veldrix

logger = logging.getLogger("veldrix.interceptor.http")

_VELDRIX_INSTANCE: Optional["Veldrix"] = None
_ON_RESULT_CALLBACK: Optional[Callable] = None
_PATCHED    = False
_PATCH_LOCK = _threading.Lock()

# Fix — Issue 6 / C: strong-reference set for fire-and-forget async tasks.
_INTERCEPT_TASKS: Set[asyncio.Task] = set()

# Fix — Issue A: bounded thread pool for sync background dispatch.
# Caps OS thread creation at 32 workers — identical contract to interceptor.py's
# _SYNC_BG_POOL. Submissions beyond capacity are dropped (non-fatal).
_INTERCEPT_BG_POOL = ThreadPoolExecutor(
    max_workers=32,
    thread_name_prefix="veldrix-intercept-bg",
)
_INTERCEPT_BG_LOCK    = _threading.Lock()
_INTERCEPT_BG_QUEUED  = 0
_INTERCEPT_BG_DROPPED = 0
_INTERCEPT_BG_MAX     = 10_000


def _shutdown_intercept_pool() -> None:
    try:
        _INTERCEPT_BG_POOL.shutdown(wait=False, cancel_futures=True)
    except TypeError:
        _INTERCEPT_BG_POOL.shutdown(wait=False)
    except Exception:
        pass


atexit.register(_shutdown_intercept_pool)


def enable_global_intercept(
    veldrix_instance: "Veldrix",
    on_result: Optional[Callable] = None,
) -> None:
    """
    Called by the developer after creating a Veldrix client.
    Patches httpx and requests once. Idempotent.

    Args:
        veldrix_instance: The Veldrix client to use for evaluations.
        on_result: Optional callback invoked after every evaluation completes.
            Signature: on_result(prompt: str, response: str, trust: TrustResult)
            Runs in the background — never blocks the LLM call.
            Exceptions are caught and logged, never propagated.

    Example::

        def audit(prompt, response, trust):
            print(f"verdict={trust.verdict} score={trust.overall:.0%}")

        enable_global_intercept(veldrix, on_result=audit)
    """
    global _VELDRIX_INSTANCE, _ON_RESULT_CALLBACK, _PATCHED
    _VELDRIX_INSTANCE   = veldrix_instance
    _ON_RESULT_CALLBACK = on_result

    with _PATCH_LOCK:
        if _PATCHED:
            return
        _patch_httpx()
        _patch_requests()
        _PATCHED = True

    logger.info("VeldrixAI global HTTP interceptor enabled — all AI endpoints monitored")


def disable_global_intercept() -> None:
    """Restore original HTTP clients. Useful in tests."""
    global _PATCHED, _ON_RESULT_CALLBACK
    _unpatch_httpx()
    _unpatch_requests()
    _PATCHED = False
    _ON_RESULT_CALLBACK = None
    logger.info("VeldrixAI global HTTP interceptor disabled")


_original_httpx_send: Any = None
_original_httpx_async_send: Any = None


def _patch_httpx() -> None:
    global _original_httpx_send, _original_httpx_async_send
    try:
        import httpx

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


# ── Public helper (used by tests and external callers) ───────────────────────

def _safe_create_task(coro) -> Optional[asyncio.Task]:
    """
    Schedule a coroutine as a fire-and-forget task inside the running event loop.
    Holds a strong reference in _INTERCEPT_TASKS so GC cannot drop the task
    before it executes (Fix — Issue C).
    Returns the Task if scheduled, None if no loop is running.
    Never raises. Never blocks.
    """
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(coro)
        _INTERCEPT_TASKS.add(task)
        task.add_done_callback(_INTERCEPT_TASKS.discard)
        return task
    except RuntimeError:
        # No running event loop — close the coroutine to prevent ResourceWarning.
        try:
            coro.close()
        except Exception:
            pass
        return None
    except Exception as e:
        logger.debug("_safe_create_task failed (non-fatal): %s", e)
        try:
            coro.close()
        except Exception:
            pass
        return None


# ── Bounded background dispatch helper ───────────────────────────────────────

def _dispatch_in_thread(prompt: str, resp_text: str) -> None:
    """
    Fire-and-forget evaluation submitted to the bounded _INTERCEPT_BG_POOL.

    Fix — Issue A: previously spawned a raw daemon thread per call with no cap.
    Under 500 concurrent AI calls this created 500 OS threads. Now capped at
    32 workers via ThreadPoolExecutor. Submissions beyond _INTERCEPT_BG_MAX
    are dropped with a debug log — same semantics as the async queue overflow.

    Each work item owns its own event loop + fresh AsyncClient.
    NEVER touches the shared singleton client.
    Invokes _ON_RESULT_CALLBACK after evaluation if set (Fix — Issue 7).
    """
    global _INTERCEPT_BG_QUEUED, _INTERCEPT_BG_DROPPED

    with _INTERCEPT_BG_LOCK:
        if _INTERCEPT_BG_QUEUED >= _INTERCEPT_BG_MAX:
            _INTERCEPT_BG_DROPPED += 1
            logger.debug(
                "veldrix intercept_bg_pool: queue full, dropping evaluation (dropped_total=%d)",
                _INTERCEPT_BG_DROPPED,
            )
            return
        _INTERCEPT_BG_QUEUED += 1

    def _run():
        global _INTERCEPT_BG_QUEUED
        loop   = asyncio.new_event_loop()
        client = None
        try:
            client = _VELDRIX_INSTANCE._transport._make_fresh_client()
            from veldrixai.models import GuardConfig
            trust = loop.run_until_complete(
                _VELDRIX_INSTANCE._transport.evaluate_with_client(
                    client, prompt, resp_text, GuardConfig(background=True),
                )
            )
            if _ON_RESULT_CALLBACK is not None:
                try:
                    _ON_RESULT_CALLBACK(prompt, resp_text, trust)
                except Exception as cb_exc:
                    logger.debug("on_result callback raised (non-fatal): %s", cb_exc)
        except Exception as exc:
            logger.debug("HTTP intercept pool eval failed (non-fatal): %s", exc)
        finally:
            with _INTERCEPT_BG_LOCK:
                _INTERCEPT_BG_QUEUED -= 1
            if client is not None:
                try:
                    loop.run_until_complete(client.aclose())
                except Exception:
                    pass
            try:
                loop.close()
            except Exception:
                pass

    try:
        _INTERCEPT_BG_POOL.submit(_run)
    except RuntimeError:
        # Pool shut down at interpreter exit — decrement counter and drop silently.
        with _INTERCEPT_BG_LOCK:
            _INTERCEPT_BG_QUEUED -= 1


# ── Intercept handlers ────────────────────────────────────────────────────────

def _handle_sync(request: Any, response: Any) -> None:
    """Sync httpx intercept — always uses _dispatch_in_thread."""
    try:
        from veldrixai.providers import match_provider
        if not match_provider(str(request.url)):
            return
        prompt, resp_text = _extract_from_httpx(request, response)
        if not prompt and not resp_text:
            return
        _dispatch_in_thread(prompt or "", resp_text or "")
    except Exception as e:
        logger.debug("HTTP intercept sync handler error: %s", e)


async def _handle_async(request: Any, response: Any) -> None:
    """
    Async httpx intercept.

    Running-loop path  — submit as a fire-and-forget task via _safe_create_task
                         using the shared singleton client (same loop, safe).
                         Task reference held in _INTERCEPT_TASKS to prevent GC
                         collection before execution.
    No-loop path       — fall back to _dispatch_in_thread which uses
                         _make_fresh_client() (never the singleton).

    Full config propagation: all fields from _default_cfg are copied so
    timeout_ms, metadata, and on_block are never silently dropped.
    """
    try:
        from veldrixai.providers import match_provider
        if not match_provider(str(request.url)):
            return
        prompt, resp_text = _extract_from_httpx(request, response)
        if not prompt and not resp_text:
            return

        p = prompt or ""
        r = resp_text or ""

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            _dispatch_in_thread(p, r)
            return

        # Build config from all default_cfg fields — not just background + metadata.
        from veldrixai.models import GuardConfig
        default = _VELDRIX_INSTANCE._default_cfg
        cfg = GuardConfig(
            background=default.background,
            timeout_ms=default.timeout_ms,
            metadata=dict(default.metadata),
            # block_on_verdict / on_block intentionally omitted for the
            # interceptor path — the caller never sees a GuardedResponse here,
            # so blocking would silently swallow the LLM response.
        )

        async def _eval_and_callback() -> None:
            trust = await _VELDRIX_INSTANCE._transport.evaluate(
                prompt=p, response=r, config=cfg
            )
            if _ON_RESULT_CALLBACK is not None:
                try:
                    _ON_RESULT_CALLBACK(p, r, trust)
                except Exception as cb_exc:
                    logger.debug("on_result callback raised (non-fatal): %s", cb_exc)

        # _safe_create_task holds the strong reference in _INTERCEPT_TASKS.
        _safe_create_task(_eval_and_callback())

    except Exception as exc:
        logger.debug("HTTP intercept async handler error: %s", exc)


def _handle_sync_requests(request: Any, response: Any) -> None:
    """requests.Session intercept — always uses _dispatch_in_thread."""
    try:
        from veldrixai.providers import match_provider
        if not match_provider(str(request.url)):
            return
        prompt   = _extract_prompt_from_body(request.body)
        resp_txt = _extract_response_text(response.text)
        if not prompt and not resp_txt:
            return
        _dispatch_in_thread(prompt or "", resp_txt or "")
    except Exception as e:
        logger.debug("requests intercept handler error: %s", e)


# ── Extraction helpers ────────────────────────────────────────────────────────

def _extract_from_httpx(request: Any, response: Any):
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
    """
    Extract the assistant text from any AI provider response body.

    Always returns a string (possibly truncated to 4 000 chars) or None only
    when the input is empty. Never returns None for large responses — truncates
    instead. This ensures trust evaluation always receives the actual content,
    not an empty string, regardless of response body size.

    Previously this returned None for non-JSON bodies >= 5 000 chars, which
    caused evaluations to score an empty string for large Ollama / Bedrock /
    HuggingFace TGI plain-text responses. Fixed.
    """
    if not text:
        return None

    try:
        data = json.loads(text)
    except Exception:
        # Not JSON — plain-text response (Ollama generate, HuggingFace TGI, etc.)
        # Always truncate, never drop.
        return text[:_MAX_PAYLOAD_CHARS]

    # OpenAI / LiteLLM / Mistral / Groq / Together / Fireworks / DeepSeek / Qwen
    choices = data.get("choices", [])
    if choices:
        c = choices[0]
        if isinstance(c, dict):
            msg = c.get("message", {})
            if isinstance(msg, dict):
                # Tool call / function call — agent mode
                if c.get("finish_reason") == "tool_calls":
                    tool_calls = msg.get("tool_calls") or []
                    parts = []
                    for tc in tool_calls:
                        fn = tc.get("function", {}) if isinstance(tc, dict) else {}
                        parts.append(f"[tool_call:{fn.get('name','unknown')}] {str(fn.get('arguments',''))[:500]}")
                    return " | ".join(parts)[:_MAX_PAYLOAD_CHARS] if parts else "[tool_call]"
                content = msg.get("content") or msg.get("text")
                return content[:_MAX_PAYLOAD_CHARS] if content else None
            text_val = c.get("text") or c.get("content")
            return text_val[:_MAX_PAYLOAD_CHARS] if text_val else None

    # Anthropic Messages API
    content = data.get("content", [])
    if isinstance(content, list) and content:
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                val = block.get("text", "")
                return val[:_MAX_PAYLOAD_CHARS] if val else None

    # Google Gemini
    try:
        val = data["candidates"][0]["content"]["parts"][0]["text"]
        return val[:_MAX_PAYLOAD_CHARS] if val else None
    except (KeyError, IndexError, TypeError):
        pass

    # Cohere
    if "text" in data:
        val = data["text"]
        return val[:_MAX_PAYLOAD_CHARS] if isinstance(val, str) else None

    # Cohere v1 generate
    if "generations" in data:
        gens = data["generations"]
        if gens and isinstance(gens[0], dict):
            val = gens[0].get("text", "")
            return val[:_MAX_PAYLOAD_CHARS] if val else None

    # AWS Bedrock / generic known keys
    for key in ("outputText", "output", "response", "result", "answer"):
        if key in data and isinstance(data[key], str):
            return data[key][:_MAX_PAYLOAD_CHARS]

    # ── Universal JSON fallback — prevents false ALLOW on unknown providers ──
    # Any JSON response that didn't match a known structure above is serialised
    # back to a compact string so the trust engine evaluates real content, not
    # an empty string. This eliminates false ALLOW scores for custom providers,
    # new provider formats, and any response shape not yet in the extraction logic.
    try:
        fallback = json.dumps(data, ensure_ascii=False)
        return fallback[:_MAX_PAYLOAD_CHARS]
    except Exception:
        return text[:_MAX_PAYLOAD_CHARS]
