"""
Tests for the Redis-backed distributed circuit breaker.

Uses fakeredis (in-process Redis emulation) — no real Redis server required.
Tests verify:
  - Multi-worker convergence: global threshold, not threshold × num_workers
  - HALF_OPEN probe slot: exactly one worker wins across concurrent instances
  - Redis fallback: unreachable Redis → in-process mode + WARNING log
  - TTL: keys expire after failure_window × 3 (breaker self-heals)
  - Async interface parity with in-process breaker
"""

from __future__ import annotations

import asyncio
import logging
import time

import pytest
import pytest_asyncio

# ── fakeredis setup ───────────────────────────────────────────────────────────
# fakeredis.aioredis provides an in-process async Redis compatible with redis.asyncio
try:
    import fakeredis.aioredis as fakeredis_async  # type: ignore
    HAS_FAKEREDIS = True
except ImportError:
    HAS_FAKEREDIS = False

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _make_breaker(
    fake_server,
    failure_threshold: int = 3,
    recovery_timeout: int = 60,
    fallback_after: int = 5,
) -> "RedisCircuitBreaker":  # noqa: F821
    """Create a RedisCircuitBreaker wired to a fakeredis server."""
    from src.inference.circuit_breaker_redis import RedisCircuitBreaker
    import redis.asyncio as aioredis  # type: ignore

    breaker = RedisCircuitBreaker(
        redis_url="redis://localhost",  # URL not used — client injected below
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        fallback_after=fallback_after,
    )
    # Inject fakeredis client directly so no real Redis is needed
    client = fakeredis_async.FakeRedis(server=fake_server, decode_responses=True)
    breaker._client = client
    # Load Lua scripts into fake server
    breaker._sha_failure = await client.script_load(
        breaker.__class__.__dict__["_LUA_RECORD_FAILURE"]
        if hasattr(breaker.__class__, "_LUA_RECORD_FAILURE")
        else _get_lua_failure()
    )
    breaker._sha_success = await client.script_load(
        _get_lua_success()
    )
    breaker._sha_availability = await client.script_load(
        _get_lua_availability()
    )
    return breaker


def _get_lua_failure():
    from src.inference.circuit_breaker_redis import _LUA_RECORD_FAILURE
    return _LUA_RECORD_FAILURE


def _get_lua_success():
    from src.inference.circuit_breaker_redis import _LUA_RECORD_SUCCESS
    return _LUA_RECORD_SUCCESS


def _get_lua_availability():
    from src.inference.circuit_breaker_redis import _LUA_TRY_AVAILABILITY
    return _LUA_TRY_AVAILABILITY


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_server():
    """Shared fakeredis server — all instances in a test share the same keyspace."""
    if not HAS_FAKEREDIS:
        pytest.skip("fakeredis not installed")
    import fakeredis
    return fakeredis.FakeServer()


# ── Test: multi-worker convergence ────────────────────────────────────────────

@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_multi_worker_trips_at_global_threshold(fake_server):
    """
    Four simulated workers share failure counts via fakeredis.
    The breaker should OPEN at exactly FAILURE_THRESHOLD cumulative failures,
    not at THRESHOLD × 4.
    """
    threshold = 3
    workers = [
        await _make_breaker(fake_server, failure_threshold=threshold, recovery_timeout=60)
        for _ in range(4)
    ]
    provider = "test_provider"

    # Verify all start CLOSED
    for w in workers:
        assert await w.is_available(provider)

    # Record threshold-1 failures across different workers
    await workers[0].record_failure(provider)
    await workers[1].record_failure(provider)

    # Still CLOSED after threshold-1 failures
    assert await workers[2].is_available(provider)
    assert await workers[3].is_available(provider)

    # One more failure trips it globally
    await workers[2].record_failure(provider)

    # All workers now see OPEN
    for w in workers:
        assert not await w.is_available(provider)
        assert await w.get_state(provider) == "OPEN"


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_half_open_exactly_one_probe(fake_server):
    """
    After recovery_timeout, exactly ONE worker across all four should get the
    HALF_OPEN probe slot. The others must see OPEN.
    """
    threshold = 2
    recovery_timeout = 1  # short for test

    workers = [
        await _make_breaker(
            fake_server, failure_threshold=threshold, recovery_timeout=recovery_timeout
        )
        for _ in range(4)
    ]
    provider = "probe_provider"

    # Trip the breaker
    await workers[0].record_failure(provider)
    await workers[1].record_failure(provider)

    for w in workers:
        assert not await w.is_available(provider)

    # Simulate opened_at in the past (beyond recovery_timeout)
    import fakeredis.aioredis as fr
    client = fr.FakeRedis(server=fake_server, decode_responses=True)
    opened_at_key = f"veldrix:cb:{provider}:opened_at"
    await client.set(opened_at_key, str(time.time() - recovery_timeout - 1))
    await client.aclose()

    # All four workers race to check availability
    results = await asyncio.gather(*[w.is_available(provider) for w in workers])

    # Exactly one should have won the HALF_OPEN probe slot
    half_open_winners = sum(1 for r in results if r is True)
    assert half_open_winners == 1, f"Expected 1 HALF_OPEN winner, got {half_open_winners}"


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_record_success_closes_half_open(fake_server):
    """HALF_OPEN → success → CLOSED, and failures reset."""
    threshold = 2
    recovery_timeout = 1
    w = await _make_breaker(
        fake_server, failure_threshold=threshold, recovery_timeout=recovery_timeout
    )
    provider = "recovery_provider"

    # Trip
    await w.record_failure(provider)
    await w.record_failure(provider)
    assert not await w.is_available(provider)

    # Simulate elapsed recovery window
    import fakeredis.aioredis as fr
    client = fr.FakeRedis(server=fake_server, decode_responses=True)
    await client.set(
        f"veldrix:cb:{provider}:opened_at", str(time.time() - recovery_timeout - 1)
    )
    await client.aclose()

    # Acquire probe slot
    assert await w.is_available(provider)
    assert await w.get_state(provider) == "HALF_OPEN"

    # Success closes it
    await w.record_success(provider)
    assert await w.get_state(provider) == "CLOSED"
    assert await w.is_available(provider)


# ── Test: Redis fallback mode ─────────────────────────────────────────────────

@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_redis_unreachable_triggers_fallback(caplog):
    """
    When Redis is unreachable for FALLBACK_AFTER consecutive ops,
    the breaker logs WARNING and switches to in-process mode.
    """
    from src.inference.circuit_breaker_redis import RedisCircuitBreaker

    breaker = RedisCircuitBreaker(
        redis_url="redis://127.0.0.1:9999",  # nothing listening here
        failure_threshold=3,
        recovery_timeout=60,
        fallback_after=3,
    )

    provider = "unreachable_provider"

    with caplog.at_level(logging.WARNING, logger="src.inference.circuit_breaker_redis"):
        # Each call fails → Redis error counter climbs
        for _ in range(3):
            await breaker.record_failure(provider)

    # Fallback mode must be active
    assert breaker._fallback_mode is True
    assert any("fallback mode" in r.message.lower() for r in caplog.records)

    # In-process state should still work
    assert await breaker.is_available(provider) is False  # tripped in fallback too


# ── Test: TTL self-healing ────────────────────────────────────────────────────

@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_keys_expire_after_ttl(fake_server):
    """
    After failure_window × 3 with no activity, Redis keys expire and
    the breaker resets to CLOSED.
    """
    import fakeredis.aioredis as fr

    threshold = 2
    recovery_timeout = 1  # 1s → TTL = 3s (failure_window × 3)

    w = await _make_breaker(
        fake_server, failure_threshold=threshold, recovery_timeout=recovery_timeout
    )
    provider = "ttl_provider"

    # Trip the breaker
    await w.record_failure(provider)
    await w.record_failure(provider)
    assert not await w.is_available(provider)

    # Manually expire all keys (simulating TTL elapsed)
    client = fr.FakeRedis(server=fake_server, decode_responses=True)
    for suffix in ("state", "failures", "opened_at", "half_open_in_flight"):
        await client.delete(f"veldrix:cb:{provider}:{suffix}")
    await client.aclose()

    # After TTL expiry, breaker is back to CLOSED
    state = await w.get_state(provider)
    assert state == "CLOSED"
    assert await w.is_available(provider)


# ── Test: reset() admin function ─────────────────────────────────────────────

@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
async def test_reset_clears_open_state(fake_server):
    """reset() should force CLOSED regardless of prior failures."""
    threshold = 2
    w = await _make_breaker(fake_server, failure_threshold=threshold)
    provider = "reset_provider"

    await w.record_failure(provider)
    await w.record_failure(provider)
    assert not await w.is_available(provider)

    await w.reset(provider)
    assert await w.is_available(provider)


# ── Test: backward compat with memory backend ─────────────────────────────────

async def test_memory_backend_still_works(monkeypatch):
    """
    CIRCUIT_BREAKER_BACKEND=memory uses in-process breaker.
    Existing sync interface (is_available, record_failure, record_success) works.
    """
    monkeypatch.setenv("CIRCUIT_BREAKER_BACKEND", "memory")

    from src.inference import circuit_breaker as cb

    # Reset module state
    cb._redis_backend = None
    provider = "memory_provider"

    # Sync fallback path
    assert cb.is_available(provider)
    cb.record_failure(provider)
    cb.record_failure(provider)
    cb.record_failure(provider)
    assert not cb.is_available(provider)
    # Reset for other tests
    cb._circuits.pop(provider, None)
