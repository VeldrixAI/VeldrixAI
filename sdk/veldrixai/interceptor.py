"""
VeldrixAI Interceptor
Sits between the decorated function and the trust evaluation pipeline.
Detects the call pattern, extracts prompt+response, dispatches to VeldrixAI API.
"""

from __future__ import annotations
import asyncio
import inspect
import logging
import threading
from typing import Any, Callable

from veldrixai.adapters.generic import extract_prompt as generic_prompt
from veldrixai.adapters.generic import extract_response as generic_response
from veldrixai.models import GuardedResponse, TrustResult, GuardConfig

logger = logging.getLogger("veldrix.interceptor")


def _detect_adapter(result: Any):
    """
    Detect which adapter to use based on the return type.
    Returns (extract_prompt_fn, extract_response_fn).
    """
    # Check for OpenAI / LiteLLM ChatCompletion
    if hasattr(result, "choices") and hasattr(result, "model"):
        try:
            import litellm
            if isinstance(result, litellm.ModelResponse):
                from veldrixai.adapters.litellm import extract_prompt, extract_response
                return extract_prompt, extract_response
        except ImportError:
            pass
        from veldrixai.adapters.openai import extract_prompt, extract_response
        return extract_prompt, extract_response

    # LangChain AIMessage
    if hasattr(result, "content") and hasattr(result, "response_metadata"):
        from veldrixai.adapters.langchain import extract_prompt, extract_response
        return extract_prompt, extract_response

    # Fallback
    return generic_prompt, generic_response


def _run_async_in_thread(transport, prompt: str, response: str, config: GuardConfig) -> TrustResult:
    """
    Run trust evaluation in a new daemon thread.
    Each invocation creates its own event loop AND its own httpx.AsyncClient.
    Safe to call from any sync context including inside a running event loop.
    """
    result_holder: list[TrustResult] = []
    exc_holder:    list[Exception]   = []

    def _run():
        loop   = asyncio.new_event_loop()
        client = None
        try:
            client = transport._make_fresh_client()
            result_holder.append(
                loop.run_until_complete(
                    transport.evaluate_with_client(client, prompt, response, config)
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

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=15)
    if exc_holder:
        raise exc_holder[0]
    if result_holder:
        return result_holder[0]
    logger.warning("VeldrixAI sync evaluation timed out")
    return _pending_trust()


class Interceptor:
    """
    Wraps a sync or async function. On every call:
      1. Calls the original function → gets the LLM result
      2. Extracts prompt (from args) and response (from result)
      3. Ships to VeldrixAI API (background or foreground per config)
      4. Returns GuardedResponse(original_result, trust_scores)
    """

    def __init__(self, fn: Callable, transport, config: GuardConfig):
        self._fn        = fn
        self._transport = transport
        self._config    = config
        self._is_async  = inspect.iscoroutinefunction(fn)

    def __call__(self, *args, **kwargs):
        if self._is_async:
            return self._async_call(*args, **kwargs)
        return self._sync_call(*args, **kwargs)

    def _sync_call(self, *args, **kwargs):
        result = self._fn(*args, **kwargs)
        prompt_extractor, response_extractor = _detect_adapter(result)
        prompt   = prompt_extractor(args, kwargs) or ""
        response = response_extractor(result)

        if self._config.background:
            # Fire-and-forget: each thread owns its own event loop + client
            def _run():
                """
                Each invocation of _run() owns its complete async lifecycle:
                its own event loop AND its own httpx.AsyncClient.
                Nothing is shared with other threads.
                """
                loop   = asyncio.new_event_loop()
                client = None
                try:
                    client = self._transport._make_fresh_client()
                    loop.run_until_complete(
                        self._transport.evaluate_with_client(
                            client, prompt, response, self._config
                        )
                    )
                except Exception as e:
                    logger.debug("Background evaluation failed (non-fatal): %s", e)
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

            threading.Thread(target=_run, daemon=True).start()
            trust = _pending_trust()
        else:
            # Foreground sync — safe inside running event loops (Jupyter, Django, etc.)
            trust = _run_async_in_thread(self._transport, prompt, response, self._config)

        guarded = GuardedResponse(original=result, trust=trust)
        self._handle_block(guarded)
        return guarded

    async def _async_call(self, *args, **kwargs):
        result = await self._fn(*args, **kwargs)
        prompt_extractor, response_extractor = _detect_adapter(result)
        prompt   = prompt_extractor(args, kwargs) or ""
        response = response_extractor(result)

        if self._config.background:
            asyncio.create_task(
                self._transport.evaluate(prompt, response, self._config)
            )
            trust = _pending_trust()
        else:
            trust = await self._transport.evaluate(prompt, response, self._config)

        guarded = GuardedResponse(original=result, trust=trust)
        self._handle_block(guarded)
        return guarded

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
    Returned when background=True — evaluation is in-flight.
    The trust scores arrive in the dashboard regardless.
    Developers who need scores synchronously should use background=False.
    """
    return TrustResult(
        overall=0.0,
        verdict="PENDING",
        pillar_scores={},
        request_id="pending",
        latency_ms=0,
    )
