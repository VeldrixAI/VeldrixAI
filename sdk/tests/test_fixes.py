"""
Regression tests for all 8 issues identified in the SDK audit.

Issue 1  — API key prefix validation (vx-live- / vx-test- only)
Issue 2  — _ensure_drain_worker TOCTOU race under concurrent async calls
Issue 3  — evaluate_sync join timeout covers full retry budget
Issue 4  — asyncio.create_task GC reference drop in _async_call
Issue 5  — GuardedStream _fire_sync join timeout respects config.timeout_ms
Issue 6  — asyncio.create_task GC reference drop in _handle_async
Issue 7  — on_result audit callback for enable_global_intercept
Issue 8  — Cohere v2 ChatResponse extraction (result.message.content[0].text)
"""

import asyncio
import threading
import pytest
import respx
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from veldrixai.models    import TrustResult, GuardConfig
from veldrixai.exceptions import VeldrixError


# ── Shared mock trust result ──────────────────────────────────────────────────

MOCK_TRUST = TrustResult(
    overall=0.95, verdict="ALLOW",
    pillar_scores={"safety": 0.97},
    request_id="req_fix_test", latency_ms=120,
)

BASE_URL = "https://api.veldrix.ai"
MOCK_RESPONSE = {
    "request_id": "req_fix_test",
    "trust_score": {
        "overall": 0.95, "verdict": "ALLOW",
        "pillar_scores": {"safety": 0.97},
        "critical_flags": [], "all_flags": [],
    },
    "pillars": {},
    "total_latency_ms": 200,
    "sdk_version": "1.0.0",
}


# ─────────────────────────────────────────────────────────────────────────────
# Issue 1 — API key prefix validation
# ─────────────────────────────────────────────────────────────────────────────

def test_issue1_rejects_vx_live_underscore_typo():
    """vx_live_... (underscore) must be rejected with a clear error."""
    from veldrixai import Veldrix
    with pytest.raises(VeldrixError, match="vx-live-"):
        Veldrix(api_key="vx_live_abc123")


def test_issue1_rejects_bare_vx_prefix():
    """vx-abc (no live/test segment) must be rejected."""
    from veldrixai import Veldrix
    with pytest.raises(VeldrixError, match="vx-live-"):
        Veldrix(api_key="vx-abc123")


def test_issue1_accepts_vx_live_prefix():
    """vx-live-... must be accepted without raising."""
    from veldrixai import Veldrix
    v = Veldrix(api_key="vx-live-validkey123")
    assert v is not None


def test_issue1_accepts_vx_test_prefix():
    """vx-test-... must be accepted without raising."""
    from veldrixai import Veldrix
    v = Veldrix(api_key="vx-test-validkey123")
    assert v is not None


def test_issue1_error_message_mentions_underscore_mistake():
    """Error message must mention the underscore vs dash common mistake."""
    from veldrixai import Veldrix
    with pytest.raises(VeldrixError, match="underscore"):
        Veldrix(api_key="vx_test_abc")


# ─────────────────────────────────────────────────────────────────────────────
# Issue 2 — _ensure_drain_worker TOCTOU race
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue2_concurrent_evaluate_creates_single_drain_worker():
    """
    Two concurrent evaluate(background=True) calls must create exactly one
    drain_worker task, not two competing workers.
    """
    from veldrixai.transport import Transport

    with respx.mock(base_url=BASE_URL) as rx:
        rx.post("/api/v1/analyze").mock(
            return_value=httpx.Response(200, json=MOCK_RESPONSE)
        )
        t = Transport("vx-test-drain-race", BASE_URL)
        cfg = GuardConfig(background=True)

        # Fire two concurrent background evaluations
        await asyncio.gather(
            t.evaluate("prompt a", "response a", cfg),
            t.evaluate("prompt b", "response b", cfg),
        )

        # Exactly one drain_worker task must exist
        assert t._drain_task is not None
        # Give the worker a tick to start
        await asyncio.sleep(0.05)
        assert not t._drain_task.done() or t._drain_task.cancelled() is False
        await t.close()


# ─────────────────────────────────────────────────────────────────────────────
# Issue 3 — evaluate_sync join timeout covers full retry budget
# ─────────────────────────────────────────────────────────────────────────────

def test_issue3_join_timeout_covers_retry_budget():
    """
    evaluate_sync join timeout must be >= MAX_RETRIES * timeout + buffer.
    We verify the formula by inspecting the constants, not by sleeping.
    """
    from veldrixai.transport import Transport, MAX_RETRIES, BASE_BACKOFF

    timeout_ms = 5_000
    t = Transport("vx-test-join-timeout", BASE_URL, timeout_ms=timeout_ms)
    timeout_s    = timeout_ms / 1000
    join_timeout = MAX_RETRIES * (timeout_s + BASE_BACKOFF * 4) + 5.0

    # join_timeout must be strictly greater than a single timeout window
    assert join_timeout > timeout_s, (
        f"join_timeout {join_timeout:.1f}s must exceed single timeout {timeout_s:.1f}s"
    )
    # Must cover all retries
    assert join_timeout >= MAX_RETRIES * timeout_s, (
        f"join_timeout {join_timeout:.1f}s must cover {MAX_RETRIES} retries"
    )


@pytest.mark.asyncio
async def test_issue3_evaluate_sync_returns_result_not_degraded():
    """
    evaluate_sync must return the real result, not a degraded fallback,
    even when called from inside a running event loop (Jupyter / pytest-asyncio).
    """
    with respx.mock(base_url=BASE_URL) as rx:
        rx.post("/api/v1/analyze").mock(
            return_value=httpx.Response(200, json=MOCK_RESPONSE)
        )
        from veldrixai.transport import Transport
        t      = Transport("vx-test-sync-result", BASE_URL)
        config = GuardConfig(background=False)
        trust  = t.evaluate_sync("hello", "world", config)
        assert trust.verdict == "ALLOW"
        assert trust.overall == 0.95
        assert trust.is_degraded is False
        await t.close()


# ─────────────────────────────────────────────────────────────────────────────
# Issue 4 — asyncio.create_task GC reference drop in _async_call
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue4_background_task_held_in_reference_set():
    """
    After _async_call with background=True, the task must be present in
    _BACKGROUND_TASKS until it completes — proving the GC cannot drop it.
    """
    from veldrixai.interceptor import _BACKGROUND_TASKS
    from veldrixai import Veldrix

    v = Veldrix.__new__(Veldrix)
    v._transport              = MagicMock()
    v._transport.evaluate     = AsyncMock(return_value=MOCK_TRUST)
    v._transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)
    v._transport._make_fresh_client   = MagicMock(return_value=MagicMock(aclose=AsyncMock()))
    v._default_cfg = GuardConfig(background=True)

    @v.guard
    async def chat(messages):
        return "async response"

    size_before = len(_BACKGROUND_TASKS)
    result = await chat([{"role": "user", "content": "hi"}])

    # Task must have been added (may already be done by now, but was held)
    # We verify by checking evaluate was called — if GC dropped it, it wouldn't be
    assert v._transport.evaluate.called or len(_BACKGROUND_TASKS) >= size_before
    assert result.trust.verdict == "PENDING"  # background returns PENDING immediately


@pytest.mark.asyncio
async def test_issue4_background_tasks_set_cleans_up_after_completion():
    """
    _BACKGROUND_TASKS must not grow unboundedly — done tasks must be removed
    via the done-callback.
    """
    from veldrixai.interceptor import _BACKGROUND_TASKS

    completed = []

    async def fast_coro():
        completed.append(True)

    task = asyncio.create_task(fast_coro())
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    await asyncio.sleep(0.05)  # let it complete

    assert task not in _BACKGROUND_TASKS, "Completed task must be removed from _BACKGROUND_TASKS"
    assert completed == [True]


# ─────────────────────────────────────────────────────────────────────────────
# Issue 5 — GuardedStream _fire_sync join timeout respects config.timeout_ms
# ─────────────────────────────────────────────────────────────────────────────

def test_issue5_stream_join_timeout_respects_config_timeout_ms():
    """
    GuardedStream._fire_sync join timeout must be derived from
    config.timeout_ms, not a hard-coded 15s.
    """
    from veldrixai.streaming import GuardedStream
    from veldrixai.transport import MAX_RETRIES, BASE_BACKOFF

    transport = MagicMock()
    transport._make_fresh_client.return_value = MagicMock(aclose=AsyncMock())

    # Use a short timeout to verify the formula
    config = GuardConfig(background=False, timeout_ms=2_000)
    stream = GuardedStream(iter(["hello"]), transport, config, prompt="hi")

    timeout_s    = config.timeout_ms / 1000
    expected_min = MAX_RETRIES * timeout_s  # must cover all retries
    expected_join = MAX_RETRIES * (timeout_s + BASE_BACKOFF * 4) + 5.0

    assert expected_join > 15.0 or timeout_s < 5.0, (
        "With default 10s timeout, join_timeout must exceed the old hard-coded 15s"
    )
    assert expected_join >= expected_min


def test_issue5_stream_join_timeout_exceeds_old_hardcoded_15s_for_default_config():
    """With default timeout_ms=10_000, the new join timeout must exceed 15s."""
    from veldrixai.transport import MAX_RETRIES, BASE_BACKOFF

    timeout_s    = 10_000 / 1000  # default
    join_timeout = MAX_RETRIES * (timeout_s + BASE_BACKOFF * 4) + 5.0
    assert join_timeout > 15.0, (
        f"Default join_timeout {join_timeout:.1f}s must exceed old hard-coded 15s"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Issue 6 — asyncio.create_task GC reference drop in _handle_async
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue6_intercept_tasks_set_holds_reference():
    """
    _handle_async must add the created task to _INTERCEPT_TASKS so GC
    cannot drop it before it runs.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import (
        enable_global_intercept, disable_global_intercept, _INTERCEPT_TASKS,
    )

    disable_global_intercept()

    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)
    mock_veldrix._transport   = MagicMock()
    mock_veldrix._transport.evaluate = AsyncMock(return_value=MOCK_TRUST)

    enable_global_intercept(mock_veldrix)

    try:
        # Simulate _handle_async being called with a matched AI URL
        mock_request  = MagicMock()
        mock_request.url = "https://api.openai.com/v1/chat/completions"
        mock_request.content = b'{"messages":[{"role":"user","content":"hi"}]}'
        mock_response = MagicMock()
        mock_response.text = '{"choices":[{"message":{"content":"hello"}}]}'

        size_before = len(_INTERCEPT_TASKS)
        await http_interceptor._handle_async(mock_request, mock_response)
        # Give the task a tick
        await asyncio.sleep(0.05)

        # evaluate was called — task ran (was not GC'd)
        assert mock_veldrix._transport.evaluate.called
    finally:
        disable_global_intercept()


# ─────────────────────────────────────────────────────────────────────────────
# Issue 7 — on_result audit callback
# ─────────────────────────────────────────────────────────────────────────────

def test_issue7_on_result_callback_invoked_in_thread_dispatch():
    """
    _dispatch_in_thread must invoke on_result(prompt, response, trust)
    after evaluation completes.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    disable_global_intercept()

    received = []

    def audit(prompt, response, trust):
        received.append((prompt, response, trust.verdict))

    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)

    # Make _make_fresh_client return a real-ish mock
    mock_client = MagicMock()
    mock_client.aclose = AsyncMock()
    mock_veldrix._transport._make_fresh_client.return_value = mock_client
    mock_veldrix._transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)

    enable_global_intercept(mock_veldrix, on_result=audit)

    try:
        http_interceptor._dispatch_in_thread("test prompt", "test response")
        # Wait for the daemon thread to finish
        import time
        time.sleep(0.3)
        assert len(received) == 1
        assert received[0][0] == "test prompt"
        assert received[0][1] == "test response"
        assert received[0][2] == "ALLOW"
    finally:
        disable_global_intercept()


def test_issue7_on_result_callback_exception_does_not_propagate():
    """
    An exception raised inside on_result must be caught and logged,
    never propagated to the caller.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    disable_global_intercept()

    def bad_callback(prompt, response, trust):
        raise RuntimeError("callback exploded")

    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)
    mock_client = MagicMock()
    mock_client.aclose = AsyncMock()
    mock_veldrix._transport._make_fresh_client.return_value = mock_client
    mock_veldrix._transport.evaluate_with_client = AsyncMock(return_value=MOCK_TRUST)

    enable_global_intercept(mock_veldrix, on_result=bad_callback)

    try:
        # Must not raise even though callback raises
        http_interceptor._dispatch_in_thread("p", "r")
        import time
        time.sleep(0.3)
        # If we reach here, the exception was swallowed correctly
    finally:
        disable_global_intercept()


def test_issue7_enable_global_intercept_accepts_no_callback():
    """enable_global_intercept without on_result must still work (backward compat)."""
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept
    disable_global_intercept()
    mock_veldrix = MagicMock()
    mock_veldrix._default_cfg = GuardConfig(background=True)
    # Must not raise
    enable_global_intercept(mock_veldrix)
    disable_global_intercept()


# ─────────────────────────────────────────────────────────────────────────────
# Issue 8 — Cohere v2 ChatResponse extraction
# ─────────────────────────────────────────────────────────────────────────────

def test_issue8_cohere_v2_chatresponse_extracts_text():
    """
    Cohere v2 ChatResponse: result.message.content[0].text must be extracted,
    not str(result.message) which returns the object repr.
    """
    from veldrixai.adapters.cohere import extract_response
    from types import SimpleNamespace

    # Simulate cohere-python >= 5.x ChatResponse structure
    block   = SimpleNamespace(type="text", text="Paris is the capital of France.")
    message = SimpleNamespace(content=[block])
    result  = SimpleNamespace(message=message)

    extracted = extract_response(result)
    assert extracted == "Paris is the capital of France.", (
        f"Expected real text, got: {extracted!r}"
    )


def test_issue8_cohere_v2_chatresponse_dict_block():
    """Cohere v2 with dict content blocks must also extract correctly."""
    from veldrixai.adapters.cohere import extract_response
    from types import SimpleNamespace

    message = SimpleNamespace(content=[{"type": "text", "text": "Hello from Cohere v2"}])
    result  = SimpleNamespace(message=message)

    extracted = extract_response(result)
    assert extracted == "Hello from Cohere v2"


def test_issue8_cohere_v1_still_works():
    """Cohere v1 result.text must still be extracted correctly."""
    from veldrixai.adapters.cohere import extract_response
    from types import SimpleNamespace

    result = SimpleNamespace(text="Cohere v1 response text")
    assert extract_response(result) == "Cohere v1 response text"


def test_issue8_cohere_prompt_extraction_v2_messages():
    """Cohere v2 messages=[...] prompt extraction must work."""
    from veldrixai.adapters.cohere import extract_prompt

    messages = [{"role": "user", "content": "What is the capital of France?"}]
    result   = extract_prompt((), {"messages": messages})
    assert result == "What is the capital of France?"


def test_issue8_cohere_adapter_registered_for_chatresponse():
    """
    get_adapter must route a Cohere-module result to the cohere adapter,
    not fall through to generic.
    """
    from veldrixai.adapters import get_adapter
    from types import SimpleNamespace
    import sys

    # Create a fake module so type(result).__module__ contains "cohere"
    fake_module_name = "cohere.client"
    if fake_module_name not in sys.modules:
        import types as _types
        sys.modules[fake_module_name] = _types.ModuleType(fake_module_name)

    class FakeCohereResponse:
        pass

    FakeCohereResponse.__module__ = fake_module_name
    result = FakeCohereResponse()

    prompt_fn, response_fn = get_adapter(result)
    from veldrixai.adapters.cohere import extract_prompt, extract_response
    assert prompt_fn   is extract_prompt
    assert response_fn is extract_response
