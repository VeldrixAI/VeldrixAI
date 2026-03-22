"""
VeldrixAI Client
The single object developers instantiate. Provides:
  - @veldrix.guard decorator
  - async with veldrix.session() context manager
  - veldrix.evaluate(prompt, response) async manual fallback
  - veldrix.evaluate_sync(prompt, response) sync manual fallback
  - Veldrix.from_env() for 12-factor app compatibility
"""

from __future__ import annotations
import asyncio
import functools
import inspect
import logging
import os
import threading
from typing import Any, Callable, Optional, overload

from veldrixai.models      import GuardedResponse, TrustResult, GuardConfig
from veldrixai.transport   import Transport, DEFAULT_BASE_URL
from veldrixai.interceptor import Interceptor
from veldrixai.exceptions  import VeldrixError

logger = logging.getLogger("veldrix")


class Veldrix:
    """
    VeldrixAI runtime trust client.

    Usage — decorator (recommended):
        veldrix = Veldrix(api_key="vx-live-...")

        @veldrix.guard
        def chat(messages):
            return litellm.completion(model="gpt-4o", messages=messages)

        response = chat(messages)
        print(response.trust.verdict)

    Usage — async decorator:
        @veldrix.guard
        async def chat(messages):
            return await async_openai_client.chat.completions.create(...)

    Usage — with config:
        @veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
        def chat(messages):
            ...

    Usage — context manager (for dynamic / conditional guarding):
        async with veldrix.session() as session:
            result = await session.wrap(llm_fn, messages)

    Usage — manual evaluation:
        trust = await veldrix.evaluate(prompt="...", response="...")
        trust = veldrix.evaluate_sync(prompt="...", response="...")

    Usage — from environment variables (12-factor apps):
        veldrix = Veldrix.from_env()   # reads VELDRIX_API_KEY
    """

    def __init__(
        self,
        api_key:    str,
        base_url:   str  = DEFAULT_BASE_URL,
        timeout_ms: int  = 10_000,
        background: bool = True,
        **kwargs,
    ):
        if not api_key:
            raise VeldrixError(
                "api_key is required but was empty or None.\n"
                "  Get your API key at: https://app.veldrix.ai/settings/api-keys\n"
                "  Usage: Veldrix(api_key='vx-live-...')\n"
                "  Tip: Set VELDRIX_API_KEY env var and use: "
                "Veldrix(api_key=os.environ['VELDRIX_API_KEY'])"
            )
        if not isinstance(api_key, str):
            raise VeldrixError(
                f"api_key must be a string, got {type(api_key).__name__}.\n"
                "  Usage: Veldrix(api_key='vx-live-...')"
            )
        if not api_key.startswith("vx-"):
            raise VeldrixError(
                f"Invalid API key format: {api_key[:8]}...\n"
                "  VeldrixAI API keys start with 'vx-live-' or 'vx-test-'.\n"
                "  Get your key at: https://app.veldrix.ai/settings/api-keys"
            )
        self._transport   = Transport(api_key, base_url, timeout_ms)
        self._default_cfg = GuardConfig(background=background, **kwargs)
        logger.info("VeldrixAI initialised (background=%s, base_url=%s)", background, base_url)

    @classmethod
    def from_env(
        cls,
        api_key_env:  str = "VELDRIX_API_KEY",
        base_url_env: str = "VELDRIX_BASE_URL",
        **kwargs,
    ) -> "Veldrix":
        """
        Create a Veldrix instance from environment variables.

        Usage:
            # Set VELDRIX_API_KEY=vx-live-... in environment
            veldrix = Veldrix.from_env()

            # Or with a custom env var name:
            veldrix = Veldrix.from_env(api_key_env="MY_AI_TRUST_KEY")
        """
        api_key = os.environ.get(api_key_env)
        if not api_key:
            raise VeldrixError(
                f"Environment variable {api_key_env!r} is not set.\n"
                "  Set it with: export VELDRIX_API_KEY=vx-live-...\n"
                "  Or pass it directly: Veldrix(api_key='vx-live-...')\n"
                "  Get your key at: https://app.veldrix.ai/settings/api-keys"
            )
        base_url = os.environ.get(base_url_env, DEFAULT_BASE_URL)
        return cls(api_key=api_key, base_url=base_url, **kwargs)

    # ── @veldrix.guard and @veldrix.guard(config=...) ────────────────────────

    @overload
    def guard(self, fn: Callable) -> Callable: ...
    @overload
    def guard(self, *, config: GuardConfig) -> Callable: ...

    def guard(self, fn: Callable = None, *, config: GuardConfig = None):
        """
        Decorator. Works with and without arguments:
            @veldrix.guard
            @veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
        """
        effective_config = config or self._default_cfg

        def decorator(func: Callable) -> Callable:
            interceptor = Interceptor(func, self._transport, effective_config)

            if inspect.iscoroutinefunction(func):
                @functools.wraps(func)
                async def async_wrapper(*args, **kwargs):
                    return await interceptor(*args, **kwargs)
                return async_wrapper
            else:
                @functools.wraps(func)
                def sync_wrapper(*args, **kwargs):
                    return interceptor(*args, **kwargs)
                return sync_wrapper

        if fn is not None:
            return decorator(fn)
        return decorator

    # ── Context manager ────────────────────────────────────────────────────────

    def session(self, config: GuardConfig = None):
        """
        Async context manager for dynamic/conditional guarding.

            async with veldrix.session() as session:
                result = await session.wrap(my_llm_fn, messages)
                print(result.trust.verdict)
        """
        return _VeldrixSession(self._transport, config or self._default_cfg)

    # ── Manual evaluation — async ───────────────────────────────────────────

    async def evaluate(self, prompt: str, response: str, metadata: dict = None) -> TrustResult:
        """
        Manually evaluate a prompt+response pair (async).
        Use when you cannot use the decorator.
        """
        cfg = GuardConfig(background=False, metadata=metadata or {})
        return await self._transport.evaluate(prompt, response, cfg)

    # ── Manual evaluation — sync ────────────────────────────────────────────

    def evaluate_sync(self, prompt: str, response: str, metadata: dict = None) -> TrustResult:
        """
        Manually evaluate a prompt+response pair (sync).
        Safe to call from scripts, Jupyter notebooks, Django views, or any context
        including inside a running event loop.

        Each call creates its own event loop + fresh httpx.AsyncClient in a
        background thread — no shared state, no event loop collisions.

            trust = veldrix.evaluate_sync(prompt="...", response="...")
            print(trust.verdict)
        """
        cfg = GuardConfig(background=False, metadata=metadata or {})
        # Always use a thread with a fresh client — safe from both sync and async contexts
        result_holder: list[TrustResult] = []
        exc_holder:    list[Exception]   = []

        def _run():
            loop   = asyncio.new_event_loop()
            client = None
            try:
                client = self._transport._make_fresh_client()
                result_holder.append(
                    loop.run_until_complete(
                        self._transport.evaluate_with_client(client, prompt, response, cfg)
                    )
                )
            except Exception as e:
                exc_holder.append(e)
            finally:
                if client is not None:
                    try:
                        loop.run_until_complete(client.aclose())
                    except Exception:
                        pass
                try:
                    loop.close()
                except Exception:
                    pass

        t = threading.Thread(target=_run)
        t.start()
        t.join(timeout=cfg.timeout_ms / 1000)
        if exc_holder:
            raise exc_holder[0]
        if result_holder:
            return result_holder[0]
        raise VeldrixError("evaluate_sync timed out")

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def close(self):
        await self._transport.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()


class _VeldrixSession:
    def __init__(self, transport: Transport, config: GuardConfig):
        self._transport = transport
        self._config    = config

    async def wrap(self, fn: Callable, *args, **kwargs) -> GuardedResponse:
        """Call fn(*args, **kwargs) and wrap the result with trust evaluation."""
        interceptor = Interceptor(fn, self._transport, self._config)
        return await interceptor(*args, **kwargs)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass
