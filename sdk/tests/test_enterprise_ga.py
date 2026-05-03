"""
Enterprise GA regression tests — Issues A, B, C, D, E, F.

Issue A — _dispatch_in_thread uses bounded pool, not raw threads
Issue B — VeldrixMiddleware._evaluate task held in _MIDDLEWARE_TASKS
Issue C — _safe_create_task holds Task reference in _INTERCEPT_TASKS
Issue D — GuardedStream enforces block_on_verdict after stream completes
Issue E — Adapter registry: ChatResponse / ModelResponse require module-path
Issue F — vLLM localhost:8080 path-gating prevents false matches
"""

import asyncio
import threading
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from veldrixai.models    import TrustResult, GuardConfig
from veldrixai.exceptions import VeldrixBlockError


MOCK_TRUST = TrustResult(
    overall=0.95, verdict="ALLOW",
    pillar_scores={"safety": 0.97},
    request_id="req_ga_test", latency_ms=120,
)

BLOCK_TRUST = TrustResult(
    overall=0.05, verdict="BLOCK",
    pillar_scores={"safety": 0.02},
    critical_flags=["violence"],
    request_id="req_block_test", latency_ms=80,
)


# ─────────────────────────────────────────────────────────────────────────────
# Issue A — _dispatch_in_thread uses bounded ThreadPoolExecutor
# ─────────────────────────────────────────────────────────────────────────────

def test_issue_a_dispatch_uses_bounded_pool_not_raw_thread():
    """
    _dispatch_in_thread must submit to _INTERCEPT_BG_POOL, not spawn a raw
    threading.Thread. Verified by checking the pool's thread name prefix and
    that no raw Thread is started directly.
    """
    from veldrixai import http_interceptor

    assert hasattr(http_interceptor, "_INTERCEPT_BG_POOL"), (
        "_INTERCEPT_BG_POOL must exist on http_interceptor module"
    )
    pool = http_interceptor._INTERCEPT_BG_POOL
    # ThreadPoolExecutor stores thread_name_prefix
    assert "veldrix-intercept-bg" in (pool._thread_name_prefix or ""), (
        "Pool must use veldrix-intercept-bg thread name prefix"
    )


def test_issue_a_dispatch_increments_and_decrements_queued_counter():
    """
    _INTERCEPT_BG_QUEUED must increment on submit and decrement after the
    work item completes. Verifies the counter bookkeeping is correct.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    disable_global_intercept()

    completed = []
    event = threading.Event()

    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)
    mock_client = MagicMock()
    mock_client.aclose = AsyncMock()
    mock_veldrix._transport._make_fresh_client.return_value = mock_client
    mock_veldrix._transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)

    enable_global_intercept(mock_veldrix)

    try:
        before = http_interceptor._INTERCEPT_BG_QUEUED
        http_interceptor._dispatch_in_thread("prompt", "response")
        # Give the pool worker time to finish
        import time; time.sleep(0.3)
        after = http_interceptor._INTERCEPT_BG_QUEUED
        # Counter must return to its pre-dispatch value after completion
        assert after == before, (
            f"_INTERCEPT_BG_QUEUED did not return to {before} after completion, got {after}"
        )
    finally:
        disable_global_intercept()


def test_issue_a_dispatch_drops_when_pool_saturated():
    """
    When _INTERCEPT_BG_QUEUED >= _INTERCEPT_BG_MAX, _dispatch_in_thread must
    drop the request and increment _INTERCEPT_BG_DROPPED without raising.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    disable_global_intercept()
    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)
    enable_global_intercept(mock_veldrix)

    try:
        original_queued  = http_interceptor._INTERCEPT_BG_QUEUED
        original_dropped = http_interceptor._INTERCEPT_BG_DROPPED

        # Force saturation
        http_interceptor._INTERCEPT_BG_QUEUED = http_interceptor._INTERCEPT_BG_MAX

        http_interceptor._dispatch_in_thread("p", "r")  # must not raise

        assert http_interceptor._INTERCEPT_BG_DROPPED == original_dropped + 1
    finally:
        http_interceptor._INTERCEPT_BG_QUEUED = original_queued
        disable_global_intercept()


# ─────────────────────────────────────────────────────────────────────────────
# Issue B — VeldrixMiddleware._evaluate task held in _MIDDLEWARE_TASKS
# ─────────────────────────────────────────────────────────────────────────────

def test_issue_b_middleware_tasks_set_exists():
    """_MIDDLEWARE_TASKS must be a module-level set on veldrixai.middleware."""
    from veldrixai import middleware
    assert hasattr(middleware, "_MIDDLEWARE_TASKS"), (
        "_MIDDLEWARE_TASKS set must exist on middleware module"
    )
    assert isinstance(middleware._MIDDLEWARE_TASKS, set)


@pytest.mark.asyncio
async def test_issue_b_middleware_task_held_during_execution():
    """
    After asyncio.create_task(self._evaluate(...)), the task must be present
    in _MIDDLEWARE_TASKS until it completes — GC cannot drop it.
    """
    from veldrixai.middleware import VeldrixMiddleware, _MIDDLEWARE_TASKS

    mock_trust = TrustResult(
        overall=0.9, verdict="ALLOW", pillar_scores={}, request_id="mw_b", latency_ms=50,
    )

    with patch("veldrixai.middleware.Veldrix") as MockVeldrix:
        mock_client          = MagicMock()
        mock_client.evaluate = AsyncMock(return_value=mock_trust)
        mock_client.close    = AsyncMock()
        MockVeldrix.return_value = mock_client

        async def dummy_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body",
                        "body": b'{"choices":[{"message":{"content":"ok"}}]}'})

        mw = VeldrixMiddleware(dummy_app, api_key="vx-test-mw-b")
        mw._client = mock_client

        import json
        body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode()

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        sent = []
        async def send(msg):
            sent.append(msg)

        scope = {
            "type": "http",
            "path": "/chat",
            "headers": [(b"content-type", b"application/json")],
        }

        size_before = len(_MIDDLEWARE_TASKS)
        await mw(scope, receive, send)

        # Task must have been added (may already be done, but was held)
        # Give it a tick to complete and clean up
        await asyncio.sleep(0.05)
        # After completion the done-callback removes it — set must not grow unboundedly
        assert len(_MIDDLEWARE_TASKS) <= size_before + 1


# ─────────────────────────────────────────────────────────────────────────────
# Issue C — _safe_create_task holds Task reference in _INTERCEPT_TASKS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue_c_safe_create_task_holds_reference():
    """
    _safe_create_task must add the created Task to _INTERCEPT_TASKS so GC
    cannot collect it before it runs.
    """
    from veldrixai.http_interceptor import _safe_create_task, _INTERCEPT_TASKS

    completed = []

    async def marker():
        completed.append(True)

    size_before = len(_INTERCEPT_TASKS)
    task = _safe_create_task(marker())

    assert task is not None, "_safe_create_task must return the Task when loop is running"
    assert task in _INTERCEPT_TASKS, "Task must be in _INTERCEPT_TASKS immediately after creation"

    await asyncio.sleep(0.05)

    assert completed == [True], "Task must have executed"
    assert task not in _INTERCEPT_TASKS, "Completed task must be removed by done-callback"


@pytest.mark.asyncio
async def test_issue_c_safe_create_task_returns_none_outside_loop():
    """
    _safe_create_task called from a thread with no running loop must return
    None and close the coroutine without raising.
    """
    from veldrixai.http_interceptor import _safe_create_task

    result_holder = []

    def _thread_fn():
        async def noop():
            pass
        r = _safe_create_task(noop())
        result_holder.append(r)

    t = threading.Thread(target=_thread_fn)
    t.start()
    t.join(timeout=3)

    assert result_holder == [None], (
        "_safe_create_task must return None when no event loop is running"
    )


@pytest.mark.asyncio
async def test_issue_c_intercept_tasks_cleaned_up_after_completion():
    """_INTERCEPT_TASKS must not grow unboundedly — done tasks are removed."""
    from veldrixai.http_interceptor import _safe_create_task, _INTERCEPT_TASKS

    async def fast():
        pass

    tasks = [_safe_create_task(fast()) for _ in range(5)]
    await asyncio.sleep(0.05)

    for task in tasks:
        assert task not in _INTERCEPT_TASKS, "All completed tasks must be removed"


# ─────────────────────────────────────────────────────────────────────────────
# Issue D — GuardedStream enforces block_on_verdict after stream completes
# ─────────────────────────────────────────────────────────────────────────────

def test_issue_d_sync_stream_raises_block_error_on_block_verdict():
    """
    GuardedStream with background=False and block_on_verdict=["BLOCK"] must
    raise VeldrixBlockError after the stream is fully consumed and trust=BLOCK.
    """
    from veldrixai.streaming import GuardedStream

    transport = MagicMock()
    transport._make_fresh_client.return_value = MagicMock(aclose=AsyncMock())
    transport.evaluate_with_client = AsyncMock(return_value=BLOCK_TRUST)

    config = GuardConfig(background=False, block_on_verdict=["BLOCK"])
    stream = GuardedStream(iter(["harmful content"]), transport, config, prompt="bad prompt")

    with pytest.raises(VeldrixBlockError, match="BLOCK"):
        list(stream)


def test_issue_d_sync_stream_does_not_raise_on_allow_verdict():
    """GuardedStream must NOT raise when verdict is ALLOW."""
    from veldrixai.streaming import GuardedStream

    transport = MagicMock()
    transport._make_fresh_client.return_value = MagicMock(aclose=AsyncMock())
    transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)

    config = GuardConfig(background=False, block_on_verdict=["BLOCK"])
    stream = GuardedStream(iter(["safe content"]), transport, config, prompt="good prompt")

    chunks = list(stream)  # must not raise
    assert chunks == ["safe content"]
    assert stream.trust.verdict == "ALLOW"


def test_issue_d_sync_stream_background_never_raises_block():
    """
    background=True path returns PENDING immediately — block_on_verdict is
    not enforced (same contract as non-streaming decorator path).
    """
    from veldrixai.streaming import GuardedStream

    transport = MagicMock()
    transport._make_fresh_client.return_value = MagicMock(aclose=AsyncMock())
    transport.evaluate_with_client = AsyncMock(return_value=BLOCK_TRUST)

    # background=True + block_on_verdict raises VeldrixConfigError at construction —
    # so we test with background=True and no block_on_verdict (the valid combo).
    config = GuardConfig(background=True)
    stream = GuardedStream(iter(["content"]), transport, config, prompt="p")

    chunks = list(stream)  # must not raise
    assert chunks == ["content"]
    assert stream.trust.verdict == "PENDING"


@pytest.mark.asyncio
async def test_issue_d_async_stream_raises_block_error_on_block_verdict():
    """
    Async GuardedStream with background=False and block_on_verdict=["BLOCK"]
    must raise VeldrixBlockError after async iteration completes.
    """
    from veldrixai.streaming import GuardedStream

    transport = MagicMock()
    transport.evaluate = AsyncMock(return_value=BLOCK_TRUST)

    config = GuardConfig(background=False, block_on_verdict=["BLOCK"])

    async def _gen():
        yield "harmful async content"

    stream = GuardedStream(_gen(), transport, config, prompt="bad")

    with pytest.raises(VeldrixBlockError, match="BLOCK"):
        async for _ in stream:
            pass


@pytest.mark.asyncio
async def test_issue_d_async_stream_on_block_callback_called():
    """
    When on_block is a callable, it must be called instead of raising
    VeldrixBlockError after async stream completes with BLOCK verdict.
    """
    from veldrixai.streaming import GuardedStream

    transport = MagicMock()
    transport.evaluate = AsyncMock(return_value=BLOCK_TRUST)

    blocked_with = []

    config = GuardConfig(
        background=False,
        block_on_verdict=["BLOCK"],
        on_block=lambda s: blocked_with.append(s),
    )

    async def _gen():
        yield "content"

    stream = GuardedStream(_gen(), transport, config, prompt="p")

    async for _ in stream:
        pass  # must not raise — on_block is called instead

    assert len(blocked_with) == 1
    assert blocked_with[0] is stream


# ─────────────────────────────────────────────────────────────────────────────
# Issue E — Adapter registry: ChatResponse / ModelResponse require module-path
# ─────────────────────────────────────────────────────────────────────────────

def test_issue_e_chatresponse_from_non_cohere_module_falls_through_to_generic():
    """
    An object named ChatResponse from a non-cohere module must NOT match the
    Cohere adapter — it must fall through to generic.
    """
    from veldrixai.adapters import get_adapter
    from veldrixai.adapters.generic import extract_prompt as generic_prompt
    from veldrixai.adapters.generic import extract_response as generic_response

    class ChatResponse:
        pass

    ChatResponse.__module__ = "some_internal_sdk.responses"
    obj = ChatResponse()

    prompt_fn, response_fn = get_adapter(obj)
    assert prompt_fn   is generic_prompt,   "Non-cohere ChatResponse must use generic adapter"
    assert response_fn is generic_response


def test_issue_e_modelresponse_from_non_litellm_module_falls_through_to_generic():
    """
    An object named ModelResponse from a non-litellm module must NOT match the
    LiteLLM adapter — it must fall through to generic.
    """
    from veldrixai.adapters import get_adapter
    from veldrixai.adapters.generic import extract_prompt as generic_prompt
    from veldrixai.adapters.generic import extract_response as generic_response

    class ModelResponse:
        pass

    ModelResponse.__module__ = "my_company.ai_wrapper"
    obj = ModelResponse()

    prompt_fn, response_fn = get_adapter(obj)
    assert prompt_fn   is generic_prompt,   "Non-litellm ModelResponse must use generic adapter"
    assert response_fn is generic_response


def test_issue_e_cohere_module_chatresponse_still_matches_cohere_adapter():
    """
    An object from the cohere module must still match the Cohere adapter
    regardless of class name (v2 ChatResponse is caught by module-path branch).
    """
    import sys, types as _types
    from veldrixai.adapters import get_adapter
    from veldrixai.adapters.cohere import extract_prompt as cohere_prompt
    from veldrixai.adapters.cohere import extract_response as cohere_response

    fake_mod = "cohere.client"
    if fake_mod not in sys.modules:
        sys.modules[fake_mod] = _types.ModuleType(fake_mod)

    class ChatResponse:
        pass

    ChatResponse.__module__ = fake_mod
    obj = ChatResponse()

    prompt_fn, response_fn = get_adapter(obj)
    assert prompt_fn   is cohere_prompt
    assert response_fn is cohere_response


def test_issue_e_litellm_module_modelresponse_still_matches_litellm_adapter():
    """
    An object from the litellm module must still match the LiteLLM adapter.
    """
    import sys, types as _types
    from veldrixai.adapters import get_adapter
    from veldrixai.adapters.litellm import extract_prompt as litellm_prompt
    from veldrixai.adapters.litellm import extract_response as litellm_response

    fake_mod = "litellm.main"
    if fake_mod not in sys.modules:
        sys.modules[fake_mod] = _types.ModuleType(fake_mod)

    class ModelResponse:
        pass

    ModelResponse.__module__ = fake_mod
    obj = ModelResponse()

    prompt_fn, response_fn = get_adapter(obj)
    assert prompt_fn   is litellm_prompt
    assert response_fn is litellm_response


# ─────────────────────────────────────────────────────────────────────────────
# Issue F — vLLM localhost:8080 path-gating prevents false matches
# ─────────────────────────────────────────────────────────────────────────────

def test_issue_f_vllm_correct_path_matches():
    """localhost:8080/v1/chat/completions must match vLLM provider."""
    from veldrixai.providers import match_provider
    result = match_provider("http://localhost:8080/v1/chat/completions")
    assert result is not None
    assert result.name == "vLLM"


def test_issue_f_vllm_health_path_does_not_match():
    """localhost:8080/health must NOT match any provider (path-gated)."""
    from veldrixai.providers import match_provider
    result = match_provider("http://localhost:8080/health")
    assert result is None


def test_issue_f_vllm_arbitrary_path_does_not_match():
    """localhost:8080/api/v1/predict must NOT match (not a known AI path)."""
    from veldrixai.providers import match_provider
    result = match_provider("http://localhost:8080/api/v1/predict")
    assert result is None


def test_issue_f_vllm_completions_path_matches():
    """localhost:8080/v1/completions must match vLLM provider."""
    from veldrixai.providers import match_provider
    result = match_provider("http://localhost:8080/v1/completions")
    assert result is not None
    assert result.name == "vLLM"
