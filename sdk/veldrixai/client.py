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
from typing import Any, Callable, Optional, overload

from veldrixai.models      import GuardedResponse, TrustResult, GuardConfig
from veldrixai.transport   import Transport, DEFAULT_BASE_URL
from veldrixai.interceptor import Interceptor
from veldrixai.exceptions  import VeldrixError

logger = logging.getLogger("veldrix")


class Veldrix:
    """
    VeldrixAI runtime trust client.

    __repr__ masks the API key so it never appears in logs or tracebacks.

    Usage - decorator (recommended)::

        veldrix = Veldrix(api_key="vx-live-...")

        @veldrix.guard
        def chat(messages):
            return litellm.completion(model="gpt-4o", messages=messages)

        response = chat(messages)
        print(response.trust.verdict)

    Usage - async decorator::

        @veldrix.guard
        async def chat(messages):
            return await async_openai_client.chat.completions.create(...)

    Usage - with config::

        @veldrix.guard(config=GuardConfig(block_on_verdict=["BLOCK"]))
        def chat(messages):
            ...

    Usage - context manager (for dynamic / conditional guarding)::

        async with veldrix.session() as session:
            result = await session.wrap(llm_fn, messages)

    Usage - manual evaluation::

        trust = await veldrix.evaluate(prompt="...", response="...")
        trust = veldrix.evaluate_sync(prompt="...", response="...")

    Usage - from environment variables (12-factor apps)::

        veldrix = Veldrix.from_env()   # reads VELDRIX_API_KEY
    """

    def __init__(
        self,
        api_key:    str,
        base_url:   str   = DEFAULT_BASE_URL,
        timeout_ms: int   = 10_000,
        background: bool  = True,
        # Rate limiting — defaults are high enough to be invisible for typical usage
        rate_limit_rps:   float = 100.0,
        rate_limit_burst: float = 200.0,
        # Background dispatch queue
        queue_max_size:        int = 10_000,
        queue_overflow_policy: str = "drop_oldest",
        # Client-side circuit breaker
        client_breaker_threshold:        int   = 10,
        client_breaker_recovery_seconds: float = 30.0,
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
        if not api_key.startswith("vx-live-") and not api_key.startswith("vx-test-"):
            raise VeldrixError(
                f"Invalid API key format: '{api_key[:12]}...'\n"
                "  VeldrixAI API keys must start with 'vx-live-' (production) "
                "or 'vx-test-' (testing).\n"
                "  Common mistake: underscores instead of dashes (vx_live_ vs vx-live-).\n"
                "  Get your key at: https://app.veldrix.ai/settings/api-keys"
            )
        self._transport   = Transport(
            api_key, base_url, timeout_ms,
            rate_limit_rps=rate_limit_rps,
            rate_limit_burst=rate_limit_burst,
            queue_max_size=queue_max_size,
            queue_overflow_policy=queue_overflow_policy,
            client_breaker_threshold=client_breaker_threshold,
            client_breaker_recovery_seconds=client_breaker_recovery_seconds,
        )
        self._default_cfg = GuardConfig(background=background, **kwargs)
        self._api_key_hint = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***"
        logger.info("VeldrixAI initialised (background=%s, base_url=%s)", background, base_url)

    def stats(self) -> dict:
        """
        Return live SDK counters for observability.

        Usage:
            print(veldrix.stats())
            # {
            #   "queue_depth": 0,
            #   "queue_dropped_total": 0,
            #   "rate_limited_total": 0,
            #   "breaker_state": "CLOSED",
            #   "breaker_trips_total": 0,
            # }
        """
        return self._transport.stats()

    def __repr__(self) -> str:
        return (
            f"Veldrix(api_key='{self._api_key_hint}', "
            f"base_url='{self._transport.base_url}')"
        )

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
        # Rate limit config from environment — all optional, defaults match constructor
        rate_limit_rps = float(os.environ.get("VELDRIX_RATE_LIMIT_RPS", "100"))
        rate_limit_burst = float(os.environ.get("VELDRIX_RATE_LIMIT_BURST", "200"))
        queue_max_size = int(os.environ.get("VELDRIX_QUEUE_MAX_SIZE", "10000"))
        queue_overflow_policy = os.environ.get("VELDRIX_QUEUE_OVERFLOW_POLICY", "drop_oldest")
        return cls(
            api_key=api_key,
            base_url=base_url,
            rate_limit_rps=rate_limit_rps,
            rate_limit_burst=rate_limit_burst,
            queue_max_size=queue_max_size,
            queue_overflow_policy=queue_overflow_policy,
            **kwargs,
        )

    # ── @veldrix.guard and @veldrix.guard(config=...) ────────────────────────

    @overload
    def guard(self, fn: Callable) -> Callable: ...
    @overload
    def guard(self, *, config: GuardConfig, on_result: Optional[Callable] = None) -> Callable: ...

    def guard(
        self,
        fn:        Callable                = None,
        *,
        config:    GuardConfig             = None,
        on_result: Optional[Callable]      = None,
    ):
        """
        Decorator. Works with and without arguments::

            @veldrix.guard
            @veldrix.guard(config=GuardConfig(background=False, block_on_verdict=["BLOCK"]))

        on_result callback (enterprise audit)::

            @veldrix.guard(on_result=lambda p, r, t: print(t.verdict))
            def chat(messages):
                ...

        Signature: on_result(prompt: str, response: str, trust: TrustResult)
        Runs after every evaluation. Exceptions are caught and logged, never
        propagated to the caller.
        """
        effective_config = config or self._default_cfg

        def decorator(func: Callable) -> Callable:
            interceptor = Interceptor(
                func, self._transport, effective_config, on_result=on_result
            )

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

    async def evaluate(
        self,
        prompt:    str,
        response:  str,
        metadata:  dict                = None,
        on_result: Optional[Callable]  = None,
    ) -> TrustResult:
        """
        Manually evaluate a prompt+response pair (async).
        Use when you cannot use the decorator.

        on_result: optional callback(prompt, response, trust) fired after
        evaluation completes. Exceptions are caught and logged, never raised.
        """
        cfg   = GuardConfig(background=False, metadata=metadata or {})
        trust = await self._transport.evaluate(prompt, response, cfg)
        if on_result is not None:
            try:
                on_result(prompt, response, trust)
            except Exception as exc:
                logger.debug("evaluate on_result callback raised (non-fatal): %s", exc)
        return trust

    # ── Manual evaluation — sync ────────────────────────────────────────────

    def evaluate_sync(
        self,
        prompt:    str,
        response:  str,
        metadata:  dict                = None,
        on_result: Optional[Callable]  = None,
    ) -> TrustResult:
        """
        Manually evaluate a prompt+response pair (sync).
        Safe to call from scripts, Jupyter notebooks, Django views, or any context
        including inside a running event loop.

        on_result: optional callback(prompt, response, trust) fired after
        evaluation completes. Exceptions are caught and logged, never raised.

        Delegates to Transport.evaluate_sync() which owns the thread-isolation
        contract. Single source of truth — no duplicated logic.
        """
        cfg   = GuardConfig(background=False, metadata=metadata or {})
        trust = self._transport.evaluate_sync(prompt, response, cfg)
        if on_result is not None:
            try:
                on_result(prompt, response, trust)
            except Exception as exc:
                logger.debug("evaluate_sync on_result callback raised (non-fatal): %s", exc)
        return trust

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
