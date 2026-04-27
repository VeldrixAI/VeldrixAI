"""
VeldrixAI SDK — Rate limiting, bounded dispatch, and client-side circuit breaker.

All three primitives use stdlib asyncio only — no new dependencies.
Thread-safe for sync callers via threading.Lock where needed.

TokenBucket:
  Async token bucket — controls outbound request rate.
  Both decorator and enable() monkey-patch paths funnel through this.

BoundedDispatchQueue:
  Async bounded FIFO for background-mode evaluations.
  overflow policy: 'drop_oldest' (default) | 'drop_newest' | 'raise'

ClientCircuitBreaker:
  Lightweight client-side breaker that trips on N consecutive 5xx/timeouts.
  Prevents hammering a degraded backend.
  Background mode: silently drops on OPEN and increments counter.
  Sync mode: raises VeldrixServiceUnavailableError on OPEN.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from typing import Callable, Awaitable, TypeVar

logger = logging.getLogger("veldrix.transport")

T = TypeVar("T")

_OPEN    = "OPEN"
_CLOSED  = "CLOSED"
_HALF_OPEN = "HALF_OPEN"


class TokenBucket:
    """
    Async token bucket rate limiter.

    capacity     — max burst size (tokens)
    refill_rate  — tokens added per second (sustained RPS)
    acquire()    — suspends until a token is available or timeout elapses

    Default: 100 RPS sustained, 200 burst — invisible to typical usage.
    """

    def __init__(self, capacity: float = 200.0, refill_rate: float = 100.0) -> None:
        self._capacity = float(capacity)
        self._refill_rate = float(refill_rate)
        self._tokens = float(capacity)  # start full
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()
        self._throttle_count = 0

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._capacity, self._tokens + elapsed * self._refill_rate)
        self._last_refill = now

    async def acquire(self, timeout: float = 5.0) -> bool:
        """
        Acquire one token. Returns True if acquired, False if timeout elapsed.
        Suspends if no token is available (backpressure).
        """
        deadline = time.monotonic() + timeout
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return True
            # No token — wait for one to become available
            wait = min(1.0 / max(self._refill_rate, 0.001), deadline - time.monotonic())
            if wait <= 0:
                self._throttle_count += 1
                logger.warning("veldrix rate_limited: token bucket exhausted (total=%d)", self._throttle_count)
                return False
            await asyncio.sleep(wait)

    @property
    def throttle_count(self) -> int:
        return self._throttle_count


class BoundedDispatchQueue:
    """
    Async bounded queue for background-mode evaluations.

    max_size         — queue depth before overflow policy triggers
    on_overflow      — 'drop_oldest' | 'drop_newest' | 'raise'

    A background worker drains the queue via drain_worker() coroutine.
    """

    def __init__(
        self,
        max_size: int = 10_000,
        on_overflow: str = "drop_oldest",
    ) -> None:
        if on_overflow not in ("drop_oldest", "drop_newest", "raise"):
            raise ValueError(f"on_overflow must be drop_oldest|drop_newest|raise, got {on_overflow!r}")
        self._max_size = max_size
        self._on_overflow = on_overflow
        self._queue: deque[Callable[[], Awaitable[None]]] = deque()
        self._dropped = 0
        self._lock = asyncio.Lock()
        self._event = asyncio.Event()

    async def submit(self, coro_fn: Callable[[], Awaitable[None]]) -> bool:
        """
        Add a coroutine factory to the queue.
        Returns True if enqueued, False if dropped.
        """
        async with self._lock:
            if len(self._queue) >= self._max_size:
                if self._on_overflow == "drop_newest":
                    self._dropped += 1
                    logger.debug("veldrix queue_dropped: policy=drop_newest total=%d", self._dropped)
                    return False
                elif self._on_overflow == "drop_oldest":
                    self._queue.popleft()
                    self._dropped += 1
                    logger.debug("veldrix queue_dropped: policy=drop_oldest total=%d", self._dropped)
                else:
                    from veldrixai.exceptions import VeldrixRateLimitError
                    raise VeldrixRateLimitError(
                        f"VeldrixAI dispatch queue at capacity ({self._max_size}). "
                        "Reduce request rate or increase queue_max_size."
                    )
            self._queue.append(coro_fn)
            self._event.set()
            return True

    async def drain_worker(self) -> None:
        """Background task that drains the queue. Run via asyncio.create_task()."""
        while True:
            await self._event.wait()
            async with self._lock:
                if not self._queue:
                    self._event.clear()
                    continue
                fn = self._queue.popleft()
                if not self._queue:
                    self._event.clear()
            try:
                await fn()
            except Exception as exc:
                logger.debug("veldrix queue_worker error (non-fatal): %s", exc)

    def stats(self) -> dict:
        return {"depth": len(self._queue), "dropped_total": self._dropped}


class ClientCircuitBreaker:
    """
    Lightweight client-side circuit breaker.

    Trips CLOSED → OPEN after `threshold` consecutive 5xx/timeouts.
    After `recovery_seconds`, transitions OPEN → HALF_OPEN and admits one probe.
    On probe success → CLOSED; on probe failure → OPEN.

    Background mode: silently drops requests on OPEN (increments counter).
    Sync mode: caller must check is_open() and raise VeldrixServiceUnavailableError.
    """

    def __init__(
        self,
        threshold: int = 10,
        recovery_seconds: float = 30.0,
    ) -> None:
        self._threshold = threshold
        self._recovery = recovery_seconds
        self._state = _CLOSED
        self._consecutive_failures = 0
        self._opened_at: float = 0.0
        self._lock = threading.Lock()
        self._dropped = 0
        self._trips = 0

    def is_open(self) -> bool:
        with self._lock:
            return self._effective_state() == _OPEN

    def _effective_state(self) -> str:
        if self._state == _OPEN:
            if time.monotonic() - self._opened_at >= self._recovery:
                self._state = _HALF_OPEN
                logger.warning("veldrix client_breaker: OPEN → HALF_OPEN (probe allowed)")
            return self._state
        return self._state

    def record_success(self) -> None:
        with self._lock:
            prev = self._state
            self._consecutive_failures = 0
            self._state = _CLOSED
            if prev != _CLOSED:
                logger.warning("veldrix client_breaker: %s → CLOSED (recovered)", prev)

    def record_failure(self) -> None:
        with self._lock:
            if self._state == _HALF_OPEN:
                self._state = _OPEN
                self._opened_at = time.monotonic()
                logger.warning("veldrix client_breaker: HALF_OPEN → OPEN (probe failed)")
                return
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._threshold and self._state == _CLOSED:
                self._state = _OPEN
                self._opened_at = time.monotonic()
                self._trips += 1
                logger.warning(
                    "veldrix client_breaker: CLOSED → OPEN (threshold=%d, trips=%d)",
                    self._threshold, self._trips,
                )

    def record_drop(self) -> None:
        with self._lock:
            self._dropped += 1

    def stats(self) -> dict:
        with self._lock:
            return {
                "breaker_state": self._effective_state(),
                "breaker_trips_total": self._trips,
                "breaker_dropped_total": self._dropped,
            }
