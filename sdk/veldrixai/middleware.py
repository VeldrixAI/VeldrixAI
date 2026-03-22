"""
VeldrixAI ASGI/WSGI Middleware
For developers who own the AI-serving API server itself.

FastAPI usage:
    from veldrixai.middleware import VeldrixMiddleware
    app.add_middleware(VeldrixMiddleware, api_key="vx-live-...")

Flask usage:
    from veldrixai.middleware import init_flask
    init_flask(app, api_key="vx-live-...")
"""

from __future__ import annotations
import json
import logging
import asyncio
from typing import Any, Callable, Optional

logger = logging.getLogger("veldrix.middleware")

DEFAULT_BASE_URL = "https://api.veldrix.ai"


class VeldrixMiddleware:
    """
    ASGI middleware. Intercepts request/response bodies, extracts
    prompt+response, evaluates via VeldrixAI in the background.
    Zero added latency.
    """

    def __init__(
        self,
        app,
        api_key:       str,
        base_url:      str       = DEFAULT_BASE_URL,
        capture_paths: list[str] = None,
        exclude_paths: list[str] = None,
        min_body_size: int       = 10,
    ):
        from veldrixai.client import Veldrix
        self.app        = app
        self._client    = Veldrix(api_key=api_key, base_url=base_url)
        self._capture   = capture_paths or []
        self._exclude   = exclude_paths or ["/health", "/metrics", "/favicon"]
        self._min_body  = min_body_size

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

        req_body = b""

        async def receive_wrapper():
            nonlocal req_body
            message = await receive()
            if message["type"] == "http.request":
                req_body += message.get("body", b"")
            return message

        res_body = b""

        async def send_wrapper(message):
            nonlocal res_body
            if message["type"] == "http.response.body":
                res_body += message.get("body", b"")
            await send(message)

        await self.app(scope, receive_wrapper, send_wrapper)

        if len(req_body) >= self._min_body:
            asyncio.create_task(self._evaluate(req_body, res_body, path))

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
                await self._client.evaluate(
                    prompt=prompt or "",
                    response=response or "",
                )
        except Exception as e:
            logger.debug("ASGI middleware eval failed [%s]: %s", path, e)


def init_flask(app, api_key: str, base_url: str = DEFAULT_BASE_URL):
    """Add VeldrixAI evaluation hooks to a Flask app."""
    try:
        from flask import request, g
        import threading
        from veldrixai.client import Veldrix

        client = Veldrix(api_key=api_key, base_url=base_url)

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
                    def _run():
                        loop = asyncio.new_event_loop()
                        loop.run_until_complete(
                            client.evaluate(
                                prompt=prompt or "",
                                response=resp_txt or "",
                            )
                        )
                        loop.close()
                    threading.Thread(target=_run, daemon=True).start()
            except Exception as e:
                logger.debug("Flask after_request eval failed: %s", e)
            return response

    except ImportError:
        logger.warning("Flask not installed — init_flask() has no effect")
