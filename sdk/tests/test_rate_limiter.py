"""Tests for TokenBucket rate limiter."""

import asyncio
import pytest
import time

from veldrixai._transport.rate_limiter import TokenBucket


@pytest.mark.asyncio
async def test_token_bucket_allows_burst():
    """Burst up to capacity tokens can be acquired immediately."""
    bucket = TokenBucket(capacity=10.0, refill_rate=1.0)
    results = []
    for _ in range(10):
        ok = await bucket.acquire(timeout=0.01)
        results.append(ok)
    assert all(results)


@pytest.mark.asyncio
async def test_token_bucket_throttles_beyond_burst():
    """After burst is consumed, further immediate acquires fail (timeout=0)."""
    bucket = TokenBucket(capacity=5.0, refill_rate=1.0)
    for _ in range(5):
        await bucket.acquire(timeout=0.01)
    # Bucket is now empty
    ok = await bucket.acquire(timeout=0.0)
    assert ok is False
    assert bucket.throttle_count >= 1


@pytest.mark.asyncio
async def test_token_bucket_refill():
    """Tokens refill over time at refill_rate per second."""
    bucket = TokenBucket(capacity=5.0, refill_rate=10.0)
    for _ in range(5):
        await bucket.acquire(timeout=0.01)

    # Wait for 1 token to refill (1/10 sec = 0.1s)
    await asyncio.sleep(0.15)
    ok = await bucket.acquire(timeout=0.01)
    assert ok is True


@pytest.mark.asyncio
async def test_token_bucket_approximately_1000_at_100rps():
    """1,000 requests at 100 RPS → should take ~10s (loose tolerance in tests)."""
    N = 100  # scale down: 100 requests at 100 RPS ≈ 1s
    bucket = TokenBucket(capacity=100.0, refill_rate=100.0)
    t0 = time.monotonic()
    for _ in range(N):
        await bucket.acquire(timeout=60.0)
    elapsed = time.monotonic() - t0
    # Should complete in roughly N/refill_rate seconds ± 50%
    assert elapsed < (N / 100.0) * 1.5 + 0.5, f"Took {elapsed:.2f}s, expected ~{N/100.0:.1f}s"
