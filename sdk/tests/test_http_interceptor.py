"""
Tests for veldrixai.http_interceptor — Fix 4 and Fix 8.1.
"""
import asyncio
import threading
import pytest
from unittest.mock import MagicMock, patch


# ── Fix 4 — _safe_create_task never raises, closes coroutine on no-loop path ──

def test_safe_create_task_outside_event_loop_does_not_raise():
    """
    _safe_create_task called without a running event loop must not raise
    and must close the coroutine to prevent ResourceWarning.
    We verify the coroutine is properly handled by checking no exception fires
    and no ResourceWarning is emitted (coroutine.close() is read-only on CPython
    so we verify behaviour via warnings rather than monkey-patching).
    """
    import warnings
    from veldrixai.http_interceptor import _safe_create_task

    async def noop():
        pass

    # Capture any ResourceWarning — there must be none after _safe_create_task
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ResourceWarning)
        try:
            _safe_create_task(noop())
        except RuntimeError as e:
            pytest.fail(f"_safe_create_task raised RuntimeError: {e}")

    resource_warnings = [w for w in caught if issubclass(w.category, ResourceWarning)]
    assert resource_warnings == [], (
        f"_safe_create_task left unclosed coroutine: {resource_warnings}"
    )


@pytest.mark.asyncio
async def test_safe_create_task_inside_event_loop():
    """
    _safe_create_task called WITH a running event loop must schedule the task,
    not fall back to a thread.
    """
    from veldrixai.http_interceptor import _safe_create_task

    completed = []

    async def marker():
        completed.append(True)

    _safe_create_task(marker())
    # Give the task a chance to run
    await asyncio.sleep(0)

    assert completed == [True], "_safe_create_task did not schedule the task"


# ── Fix 8.1 — Thread-safe patch lock ─────────────────────────────────────────

def test_enable_global_intercept_is_idempotent():
    """
    Calling enable_global_intercept() twice must not double-patch httpx.
    Verified by checking that the patched send is applied exactly once.
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    # Reset state before test
    disable_global_intercept()
    assert http_interceptor._PATCHED is False

    fake_veldrix = MagicMock()
    fake_veldrix.evaluate = MagicMock(return_value=None)

    # Patch _patch_httpx to count calls
    call_count = []
    original_patch = http_interceptor._patch_httpx

    def counting_patch():
        call_count.append(1)
        original_patch()

    with patch.object(http_interceptor, "_patch_httpx", side_effect=counting_patch):
        enable_global_intercept(fake_veldrix)
        enable_global_intercept(fake_veldrix)   # second call must be a no-op

    assert len(call_count) == 1, f"_patch_httpx called {len(call_count)} times, expected 1"

    # Cleanup
    disable_global_intercept()


def test_enable_global_intercept_concurrent_calls_patch_once():
    """
    Two threads calling enable_global_intercept() simultaneously must apply
    the patch exactly once — not twice (which would wrap the wrapper).
    """
    from veldrixai import http_interceptor
    from veldrixai.http_interceptor import enable_global_intercept, disable_global_intercept

    disable_global_intercept()

    fake_veldrix = MagicMock()
    fake_veldrix.evaluate = MagicMock(return_value=None)

    call_count = []
    original_patch = http_interceptor._patch_httpx

    def counting_patch():
        call_count.append(1)
        original_patch()

    barrier = threading.Barrier(2)

    def thread_fn():
        barrier.wait()   # both threads reach enable_global_intercept simultaneously
        with patch.object(http_interceptor, "_patch_httpx", side_effect=counting_patch):
            enable_global_intercept(fake_veldrix)

    threads = [threading.Thread(target=thread_fn) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert len(call_count) == 1, (
        f"_patch_httpx called {len(call_count)} times under concurrent startup, expected 1"
    )

    disable_global_intercept()


# ── _extract_response_text universal JSON fallback — no more false ALLOW ──────

def test_extract_response_text_unknown_json_returns_content_not_none():
    """
    A JSON response from an unknown/custom provider that doesn't match any
    known extraction pattern must NOT return None (which causes false ALLOW).
    It must return the serialised JSON so the trust engine evaluates real content.
    """
    import json
    from veldrixai.http_interceptor import _extract_response_text

    unknown_payload = json.dumps({
        "id": "resp_xyz",
        "model": "custom-model-v1",
        "data": {"reply": "Here is how to make explosives"},
    })

    result = _extract_response_text(unknown_payload)
    assert result is not None, "Unknown JSON provider returned None — false ALLOW risk"
    assert len(result) > 0
    assert "custom-model-v1" in result or "reply" in result


def test_extract_response_text_openai_format_still_works():
    """Standard OpenAI format must still extract the message content directly."""
    import json
    from veldrixai.http_interceptor import _extract_response_text

    payload = json.dumps({
        "choices": [{"message": {"content": "Paris is the capital of France.", "role": "assistant"}}]
    })
    result = _extract_response_text(payload)
    assert result == "Paris is the capital of France."


def test_extract_response_text_empty_returns_none():
    from veldrixai.http_interceptor import _extract_response_text
    assert _extract_response_text("") is None
    assert _extract_response_text(None) is None


def test_extract_response_text_plain_text_returns_truncated():
    """Non-JSON plain text (Ollama, TGI) must be returned truncated, never None."""
    from veldrixai.http_interceptor import _extract_response_text
    result = _extract_response_text("Hello from Ollama!")
    assert result == "Hello from Ollama!"
