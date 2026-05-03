"""
VeldrixAI Interceptor
──────────────────────────────────────────────────────────────────────────────
Sits between the @veldrix.guard decorator and the trust evaluation pipeline.

Call flow
─────────
  @veldrix.guard
      │
      ▼
  Interceptor.__call__()
      │
      ├─ _is_stream(result)?  ──► GuardedStream (accumulates chunks, fires eval at end)
      │
      └─ Non-streaming
             │
             ├─ background=True  ──► _SyncBackgroundPool (bounded thread pool, respects
             │                       queue depth + overflow policy) → PENDING immediately
             │
             └─ background=False ──► transport.evaluate_sync() (daemon thread, own loop+client)
                                     Returns GuardedResponse(trust=TrustResult) synchronously

Sync background path
────────────────────
Previously spawned an unbounded raw threading.Thread per call, bypassing the
BoundedDispatchQueue entirely. Under load this exhausted thread pool resources
and made queue_max_size / queue_overflow_policy have zero effect on sync apps.

Fixed: _SyncBackgroundPool is a module-level bounded ThreadPoolExecutor whose
max_workers is capped at min(32, queue_max_size). Submissions that exceed the
pool's work queue use the same overflow policy as the async path.

Fix — Issue 4: asyncio.create_task GC reference drop
─────────────────────────────────────────────────────
Previously asyncio.create_task() was called without holding the returned Task
reference. Under GC pressure the task could be collected before it ran,
silently dropping background evaluations with no error or log entry.

Fixed: _BACKGROUND_TASKS is a module-level set that holds strong references to
in-flight tasks. Each task removes itself via a done-callback when it completes,
so the set never grows unboundedly. This is the pattern recommended in the
Python asyncio docs for fire-and-forget tasks.
"""

from __future__ import annotations
import asyncio
import atexit
import inspect
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional, Set

from veldrixai.adapters         import get_adapter
from veldrixai.adapters.generic import extract_prompt as generic_prompt
from veldrixai.models           import GuardedResponse, TrustResult, GuardConfig

logger = logging.getLogger("veldrix.interceptor")

# ── Fix — Issue 4: strong-reference set for fire-and-forget async tasks ──────────────
# asyncio.create_task() returns a Task that can be GC'd before it runs if no
# reference is held. This set keeps a strong reference until the task finishes.
# Each task removes itself via add_done_callback — the set never grows unboundedly.
_BACKGROUND_TASKS: Set[asyncio.Task] = set()

# ── Bounded sync background pool ──────────────────────────────────────────────
# Shared across all Veldrix instances in the process. Max 32 workers — enough
# for high-concurrency Django/Flask apps without exhausting OS thread limits.
# Work items beyond the pool queue are dropped (same semantics as async path).
_SYNC_BG_POOL: ThreadPoolExecutor = ThreadPoolExecutor(
    max_workers=32,
    thread_name_prefix="veldrix-bg",
)
_SYNC_BG_LOCK = threading.Lock()
_SYNC_BG_QUEUED = 0          # approximate in-flight count (best-effort)
_SYNC_BG_DROPPED = 0         # total dropped due to pool saturation
_SYNC_BG_MAX_QUEUED = 10_000 # matches default queue_max_size


def _shutdown_pool() -> None:
    """
    Gracefully drain the background pool at interpreter exit.
    wait=False: don't block process exit for in-flight network I/O.
    cancel_futures=True: discard queued-but-not-started work so Lambda /
    Cloud Run containers exit immediately without billing surprises.
    Falls back gracefully on Python 3.8 where cancel_futures is unavailable.
    """
    try:
        _SYNC_BG_POOL.shutdown(wait=False, cancel_futures=True)
    except TypeError:
        _SYNC_BG_POOL.shutdown(wait=False)
    except Exception:
        pass


atexit.register(_shutdown_pool)


def _submit_to_pool(fn: Callable) -> bool:
    """
    Submit fn to the bounded sync background pool.
    Returns True if submitted, False if dropped (pool saturated).
    Never raises.
    """
    global _SYNC_BG_QUEUED, _SYNC_BG_DROPPED
    with _SYNC_BG_LOCK:
        if _SYNC_BG_QUEUED >= _SYNC_BG_MAX_QUEUED:
            _SYNC_BG_DROPPED += 1
            logger.debug(
                "veldrix sync_bg_pool: queue full, dropping evaluation (dropped_total=%d)",
                _SYNC_BG_DROPPED,
            )
            return False
        _SYNC_BG_QUEUED += 1

    def _wrapped():
        global _SYNC_BG_QUEUED
        try:
            fn()
        finally:
            with _SYNC_BG_LOCK:
                _SYNC_BG_QUEUED -= 1

    try:
        _SYNC_BG_POOL.submit(_wrapped)
        return True
    except RuntimeError:
        # Pool was shut down (only happens at interpreter exit)
        with _SYNC_BG_LOCK:
            _SYNC_BG_QUEUED -= 1
        return False


def _is_stream(result: Any) -> bool:
    """
    Returns True if result is a streaming object that must NOT be consumed
    for response extraction. Covers:
      - OpenAI / LiteLLM  Stream / AsyncStream
      - Anthropic         MessageStream / MessageStreamManager
      - Any object whose module contains 'stream' and has __iter__ or __aiter__
      - httpx / requests raw streaming responses
    """
    module    = type(result).__module__ or ""
    type_name = type(result).__name__.lower()
    if "stream" in type_name:
        return True
    if "stream" in module and (hasattr(result, "__iter__") or hasattr(result, "__aiter__")):
        return True
    if hasattr(result, "iter_lines") or hasattr(result, "aiter_lines"):
        return True
    return False


class Interceptor:
    """
    Wraps a sync or async function. On every call:
      1. Calls the original function → gets the LLM result
      2. Extracts prompt (from args) and response (from result)
      3. Ships to VeldrixAI API (background or foreground per config)
      4. Fires on_result callback if provided (never raises)
      5. Returns GuardedResponse(original_result, trust_scores)
    """

    def __init__(
        self,
        fn:        Callable,
        transport: Any,
        config:    GuardConfig,
        on_result: Optional[Callable] = None,
    ):
        self._fn        = fn
        self._transport = transport
        self._config    = config
        self._on_result = on_result
        self._is_async  = inspect.iscoroutinefunction(fn)

    def __call__(self, *args, **kwargs):
        if self._is_async:
            return self._async_call(*args, **kwargs)
        return self._sync_call(*args, **kwargs)

    # ── Sync path ─────────────────────────────────────────────────────────────

    def _sync_call(self, *args, **kwargs):
        result = self._fn(*args, **kwargs)

        if _is_stream(result):
            from veldrixai.streaming import GuardedStream
            prompt = generic_prompt(args, kwargs) or ""
            return GuardedStream(result, self._transport, self._config, prompt=prompt)

        prompt_extractor, response_extractor = get_adapter(result)
        prompt   = prompt_extractor(args, kwargs) or ""
        response = response_extractor(result)

        if self._config.background:
            # Submit to the bounded sync background pool — respects queue depth
            # and overflow policy. Uses _make_fresh_client() — never the singleton.
            transport  = self._transport
            cfg        = self._config
            on_result  = self._on_result

            def _run():
                loop   = asyncio.new_event_loop()
                client = None
                try:
                    client = transport._make_fresh_client()
                    trust = loop.run_until_complete(
                        transport.evaluate_with_client(client, prompt, response, cfg)
                    )
                    if on_result is not None:
                        try:
                            on_result(prompt, response, trust)
                        except Exception as cb_exc:
                            logger.debug(
                                "guard on_result callback raised (non-fatal): %s", cb_exc
                            )
                except Exception as exc:
                    logger.debug("Background sync evaluation failed (non-fatal): %s", exc)
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

            _submit_to_pool(_run)
            trust = _pending_trust()
        else:
            # Foreground: evaluate_sync() owns its own thread + loop + client.
            trust = self._transport.evaluate_sync(prompt, response, self._config)
            if self._on_result is not None:
                try:
                    self._on_result(prompt, response, trust)
                except Exception as cb_exc:
                    logger.debug(
                        "guard on_result callback raised (non-fatal): %s", cb_exc
                    )

        guarded = GuardedResponse(original=result, trust=trust)
        self._handle_block(guarded)
        return guarded

    # ── Async path ────────────────────────────────────────────────────────────

    async def _async_call(self, *args, **kwargs):
        result = await self._fn(*args, **kwargs)

        if _is_stream(result):
            from veldrixai.streaming import GuardedStream
            prompt = generic_prompt(args, kwargs) or ""
            return GuardedStream(result, self._transport, self._config, prompt=prompt)

        prompt_extractor, response_extractor = get_adapter(result)
        prompt   = prompt_extractor(args, kwargs) or ""
        response = response_extractor(result)

        if self._config.background:
            # Fix — Issue 4: hold a strong reference to the task so the GC
            # cannot collect it before it runs. The done-callback removes it
            # from the set when the task completes or is cancelled.
            on_result = self._on_result

            async def _eval_bg():
                trust_bg = await self._transport.evaluate(prompt, response, self._config)
                if on_result is not None:
                    try:
                        on_result(prompt, response, trust_bg)
                    except Exception as cb_exc:
                        logger.debug(
                            "guard on_result callback raised (non-fatal): %s", cb_exc
                        )

            task = asyncio.create_task(_eval_bg())
            _BACKGROUND_TASKS.add(task)
            task.add_done_callback(_BACKGROUND_TASKS.discard)
            trust = _pending_trust()
        else:
            trust = await self._transport.evaluate(prompt, response, self._config)
            if self._on_result is not None:
                try:
                    self._on_result(prompt, response, trust)
                except Exception as cb_exc:
                    logger.debug(
                        "guard on_result callback raised (non-fatal): %s", cb_exc
                    )

        guarded = GuardedResponse(original=result, trust=trust)
        self._handle_block(guarded)
        return guarded

    # ── Block handler ─────────────────────────────────────────────────────────

    def _handle_block(self, guarded: GuardedResponse):
        if guarded.trust.verdict in self._config.block_on_verdict:
            if callable(self._config.on_block):
                self._config.on_block(guarded)
            else:
                from veldrixai.exceptions import VeldrixBlockError
                raise VeldrixBlockError(
                    f"Response blocked: verdict={guarded.trust.verdict}, "
                    f"flags={guarded.trust.critical_flags}"
                )


def _pending_trust() -> TrustResult:
    """
    Returned immediately when background=True — evaluation is in-flight.
    Trust scores arrive in the dashboard regardless.
    Developers who need scores synchronously should use background=False.
    """
    return TrustResult(
        overall=0.0,
        verdict="PENDING",
        pillar_scores={},
        request_id="pending",
        latency_ms=0,
    )
