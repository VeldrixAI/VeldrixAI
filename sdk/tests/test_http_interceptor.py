"""
Tests for veldrixai.http_interceptor — Fix 4 and Fix 8.1.
"""
import asyncio
import threading
import pytest
from unittest.mock import MagicMock, patch


# ── Fix 4 — _safe_create_task never raises ───────────────────────────────────

def test_safe_create_task_outside_event_loop_does_not_raise():
    """
    _safe_create_task called without a running event loop must not raise.
    This happens in some test frameworks and WSGI contexts.
    """
    from veldrixai.http_interceptor import _safe_create_task

    async def noop():
        pass

    # We are in a sync test — no loop running
    try:
        _safe_create_task(noop())
    except RuntimeError as e:
        pytest.fail(f"_safe_create_task raised RuntimeError: {e}")


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
