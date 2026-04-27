"""Tests for BoundedDispatchQueue."""

import asyncio
import pytest

from veldrixai._transport.rate_limiter import BoundedDispatchQueue
from veldrixai.exceptions import VeldrixRateLimitError


@pytest.mark.asyncio
async def test_queue_enqueue_and_drain():
    """Items submitted are processed by drain_worker."""
    queue = BoundedDispatchQueue(max_size=10, on_overflow="drop_newest")
    processed = []

    async def task(i):
        processed.append(i)

    for i in range(5):
        await queue.submit(lambda i=i: task(i))

    worker = asyncio.create_task(queue.drain_worker())
    await asyncio.sleep(0.05)
    worker.cancel()
    assert len(processed) == 5


@pytest.mark.asyncio
async def test_queue_overflow_drop_oldest():
    """When full + drop_oldest, oldest entry is removed and counter increments."""
    queue = BoundedDispatchQueue(max_size=3, on_overflow="drop_oldest")
    submitted = 0
    for _ in range(4):
        await queue.submit(lambda: asyncio.sleep(0))
        submitted += 1
    stats = queue.stats()
    assert stats["depth"] == 3
    assert stats["dropped_total"] == 1


@pytest.mark.asyncio
async def test_queue_overflow_drop_newest():
    """When full + drop_newest, newest entry is rejected."""
    queue = BoundedDispatchQueue(max_size=3, on_overflow="drop_newest")
    for _ in range(3):
        await queue.submit(lambda: asyncio.sleep(0))
    ok = await queue.submit(lambda: asyncio.sleep(0))
    assert ok is False
    assert queue.stats()["dropped_total"] == 1
    assert queue.stats()["depth"] == 3


@pytest.mark.asyncio
async def test_queue_overflow_raise():
    """When full + raise, VeldrixRateLimitError is raised."""
    queue = BoundedDispatchQueue(max_size=2, on_overflow="raise")
    for _ in range(2):
        await queue.submit(lambda: asyncio.sleep(0))
    with pytest.raises(VeldrixRateLimitError):
        await queue.submit(lambda: asyncio.sleep(0))
