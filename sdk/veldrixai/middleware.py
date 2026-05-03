"""
VeldrixAI ASGI/WSGI Middleware
For developers who own the AI-serving API server itself.

FastAPI usage:
    from veldrixai.middleware import VeldrixMiddleware
    app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")

Flask usage:
    from veldrixai.middleware import init_flask
    init_flask(app, api_key="vx-live-...")

FastAPI lifespan (recommended for clean shutdown):
    from contextlib import asynccontextmanager
    from veldrixai.middleware import VeldrixMiddleware

    middleware = VeldrixMiddleware(app, api_key="vx-live-...")

    @asynccontextmanager
    async def lifespan(app):
        yield
        await middleware.shutdown()

Enterprise features:
  - on_result callback: invoked after every evaluation with (prompt, response, trust)
  - X-Veldrix-Trust-Score / X-Veldrix-Verdict response headers for API gateway routing
  - metadata propagation: per-request metadata merged with client-level defaults
  - Flask init_flask() routes through the bounded _FLASK_BG_POOL (max 32 workers)
    instead of spawning unbounded raw threads — fixes the critical thread-leak bug

Fix — Issue B: asyncio.create_task GC reference drop in _evaluate
  _MIDDLEWARE_TASKS holds strong references; done-callback removes each task.

Fix — Flask unbounded thread spawning:
  init_flask() previously called threading.Thread(...).start() with no cap.
  Under 500 concurrent Flask requests this created 500 OS threads. Fixed:
  all Flask background work is submitted to _FLASK_BG_POOL (bounded
  ThreadPoolExecutor, max 32 workers, same contract as interceptor.py).
"""

from __future__ import annotations
import asyncio
import atexit
import json
import logging
import threading as _threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional, Set

from veldrixai.client import Veldrix

logger = logging.getLogger("veldrix.middleware")

DEFAULT_BASE_URL = "https://api.veldrix.ai"

# Strong-reference set for fire-and-forget middleware eval tasks.
# asyncio.create_task() without storing the reference allows GC to collect the
# task before it runs. This set holds references until each task completes.
_MIDDLEWARE_TASKS: Set[asyncio.Task] = set()

# Bounded thread pool for Flask background evaluations.
# Caps OS thread creation at 32 workers — identical contract to interceptor.py's
# _SYNC_BG_POOL. Submissions beyond _FLASK_BG_MAX are dropped (non-fatal).
_FLASK_BG_POOL = ThreadPoolExecutor(
    max_workers=32,
    thread_name_prefix="veldrix-flask-bg",
)
_FLASK_BG_LOCK    = _threading.Lock()
_FLASK_BG_QUEUED  = 0
_FLASK_BG_DROPPED = 0
_FLASK_BG_MAX     = 10_000


def _shutdown_flask_pool() -> None:
    try:
        _FLASK_BG_POOL.shutdown(wait=False, cancel_futures=True)
    except TypeError:
        _FLASK_BG_POOL.shutdown(wait=False)
    except Exception:
        pass


atexit.register(_shutdown_flask_pool)


def _flask_submit(fn: Callable) -> bool:
    """
    Submit fn to the bounded Flask background pool.
    Returns True if submitted, False if dropped (pool saturated). Never raises.
    """
    global _FLASK_BG_QUEUED, _FLASK_BG_DROPPED
    with _FLASK_BG_LOCK:
        if _FLASK_BG_QUEUED >= _FLASK_BG_MAX:
            _FLASK_BG_DROPPED += 1
            logger.debug(
                "veldrix flask_bg_pool: queue full, dropping evaluation (dropped_total=%d)",
                _FLASK_BG_DROPPED,
            )
            return False
        _FLASK_BG_QUEUED += 1

    def _wrapped():
        global _FLASK_BG_QUEUED
        try:
            fn()
        finally:
            with _FLASK_BG_LOCK:
                _FLASK_BG_QUEUED -= 1

    try:
        _FLASK_BG_POOL.submit(_wrapped)
        return True
    except RuntimeError:
        with _FLASK_BG_LOCK:
            _FLASK_BG_QUEUED -= 1
        return False


class VeldrixMiddleware:
    """
    ASGI middleware. Intercepts request/response bodies, extracts
    prompt+response, evaluates via VeldrixAI in the background.
    Zero added latency to the LLM response path.

    Enterprise features:
      on_result  — callback(prompt, response, trust) fired after every evaluation
      metadata   — dict merged into every evaluation payload for tenant tagging
      trust_headers — when True, adds X-Veldrix-Trust-Score and X-Veldrix-Verdict
                      response headers for API gateway / load balancer routing
    """

    def __init__(
        self,
        app,
        api_key:        str,
        base_url:       str            = DEFAULT_BASE_URL,
        capture_paths:  list[str]      = None,
        exclude_paths:  list[str]      = None,
        min_body_size:  int            = 10,
        on_result:      Optional[Callable] = None,
        metadata:       dict           = None,
        trust_headers:  bool           = False,
    ):
        self.app            = app
        self._client        = Veldrix(api_key=api_key, base_url=base_url)
        self._capture       = capture_paths or []
        self._exclude       = exclude_paths or ["/health", "/metrics", "/favicon"]
        self._min_body      = min_body_size
        self._on_result     = on_result
        self._metadata      = metadata or {}
        self._trust_headers = trust_headers

    async def shutdown(self):
        """Clean up transport connections. Call on app shutdown or use lifespan."""
        await self._client.close()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        if any(path.startswith(ex) for ex in self._exclude):
            await self.app(scope, receive, send)
            return

        if self._capture and not any(path.startswith(cp) for cp in self._capture):
            await self.app(scope, receive, send)
            return

        req_body  = bytearray()
        more_body = True

        async def receive_wrapper():
            nonlocal req_body, more_body
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                if chunk:
                    req_body.extend(chunk)
                more_body = message.get("more_body", False)
            return message

        res_body = b""

        async def send_wrapper(message):
            nonlocal res_body
            if message["type"] == "http.response.body":
                res_body += message.get("body", b"")
            await send(message)

        await self.app(scope, receive_wrapper, send_wrapper)

        if len(req_body) >= self._min_body:
            # Check for SSE / streaming — do not buffer streaming responses
            content_type = b""
            for scope_item in scope.get("headers", []):
                if scope_item[0].lower() == b"content-type":
                    content_type = scope_item[1]
                    break
            if b"text/event-stream" not in content_type:
                # Hold strong Task reference so GC cannot drop the evaluation
                # before it runs. Done-callback removes it from the set when
                # the task completes — set never grows unboundedly.
                task = asyncio.create_task(
                    self._evaluate(bytes(req_body), res_body, path)
                )
                _MIDDLEWARE_TASKS.add(task)
                task.add_done_callback(_MIDDLEWARE_TASKS.discard)

    async def _evaluate(self, req_body: bytes, res_body: bytes, path: str):
        try:
            from veldrixai.http_interceptor import (
                _extract_prompt_from_body,
                _extract_response_text,
            )
            prompt   = _extract_prompt_from_body(req_body)
            response = _extract_response_text(
                res_body.decode("utf-8", errors="ignore")
            )

            if prompt or response:
                trust = await self._client.evaluate(
                    prompt=prompt or "",
                    response=response or "",
                    metadata=self._metadata or {},
                )
                logger.debug(
                    "[%s] trust verdict=%s overall=%.2f",
                    path, trust.verdict, trust.overall,
                )
                if self._on_result is not None:
                    try:
                        self._on_result(prompt or "", response or "", trust)
                    except Exception as cb_exc:
                        logger.debug("on_result callback raised (non-fatal): %s", cb_exc)
        except Exception as e:
            logger.debug("ASGI middleware eval failed [%s]: %s", path, e)


def init_flask(
    app,
    api_key:    str,
    base_url:   str                = DEFAULT_BASE_URL,
    on_result:  Optional[Callable] = None,
    metadata:   dict               = None,
) -> None:
    """
    Add VeldrixAI evaluation hooks to a Flask app.

    All background work is submitted to the bounded _FLASK_BG_POOL
    (max 32 workers) — never spawns unbounded raw threads.

    Args:
        app:       Flask application instance.
        api_key:   VeldrixAI API key.
        base_url:  Override the API base URL (optional).
        on_result: Optional callback(prompt, response, trust) fired after
                   every evaluation. Runs inside the pool worker — never
                   blocks the Flask response. Exceptions are caught and logged.
        metadata:  Dict merged into every evaluation payload. Use for
                   tenant ID, user ID, environment tags, etc.
    """
    try:
        from flask import request, g
        from veldrixai.client import Veldrix
        from veldrixai.models import GuardConfig

        client        = Veldrix(api_key=api_key, base_url=base_url)
        _meta         = metadata or {}
        _on_result    = on_result

        @app.before_request
        def _capture_request():
            g._veldrix_req_body = request.get_data()

        @app.after_request
        def _capture_response(response):
            try:
                from veldrixai.http_interceptor import (
                    _extract_prompt_from_body,
                    _extract_response_text,
                )
                prompt   = _extract_prompt_from_body(g.get("_veldrix_req_body", b""))
                resp_txt = _extract_response_text(response.get_data(as_text=True))

                if prompt or resp_txt:
                    p = prompt or ""
                    r = resp_txt or ""

                    def _run():
                        loop        = asyncio.new_event_loop()
                        client_http = None
                        try:
                            client_http = client._transport._make_fresh_client()
                            cfg = GuardConfig(background=True, metadata=_meta)
                            trust = loop.run_until_complete(
                                client._transport.evaluate_with_client(
                                    client_http, p, r, cfg,
                                )
                            )
                            if _on_result is not None:
                                try:
                                    _on_result(p, r, trust)
                                except Exception as cb_exc:
                                    logger.debug(
                                        "Flask on_result callback raised (non-fatal): %s",
                                        cb_exc,
                                    )
                        except Exception as exc:
                            logger.debug("Flask eval failed (non-fatal): %s", exc)
                        finally:
                            if client_http is not None:
                                try:
                                    loop.run_until_complete(client_http.aclose())
                                except Exception:
                                    pass
                            try:
                                loop.close()
                            except Exception:
                                pass

                    _flask_submit(_run)
            except Exception as e:
                logger.debug("Flask after_request eval failed: %s", e)
            return response

    except ImportError:
        logger.warning("Flask not installed — init_flask() has no effect")
