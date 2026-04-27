"""Redis-backed distributed circuit breaker for the VeldrixAI inference router.

Replaces the in-process per-worker state with a shared Redis store so that
CIRCUIT_FAILURE_THRESHOLD is a global threshold across all uvicorn workers,
not THRESHOLD × num_workers.

State machine: CLOSED → OPEN → HALF_OPEN → CLOSED  (unchanged from in-process)

All state transitions happen via embedded Lua scripts so they are atomic.
No Python-side read-modify-write on any Redis key.

Key schema:
  veldrix:cb:{provider}:state                  "CLOSED"|"OPEN"|"HALF_OPEN"
  veldrix:cb:{provider}:failures               integer counter
  veldrix:cb:{provider}:opened_at              epoch seconds (float as string)
  veldrix:cb:{provider}:half_open_in_flight    "1" or absent (NX lock)

All keys carry an expiry of failure_window × 3 so a crashed HALF_OPEN state
never permanently wedges the breaker.

Fallback: if Redis is unreachable for CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES
consecutive operations, the module logs a WARNING and falls back to the
in-process implementation.  Fallback is transparent to callers.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ── Thresholds (shared with in-process breaker via env) ──────────────────────
_FAILURE_THRESHOLD: int = int(os.environ.get("CIRCUIT_FAILURE_THRESHOLD", "3"))
_RECOVERY_TIMEOUT: int = int(os.environ.get("CIRCUIT_RECOVERY_TIMEOUT", "60"))
_HALF_OPEN_SUCCESS_REQUIRED: int = int(
    os.environ.get("CIRCUIT_HALF_OPEN_SUCCESS_REQUIRED", "2")
)
_KEY_PREFIX: str = os.environ.get("CIRCUIT_BREAKER_REDIS_KEY_PREFIX", "veldrix:cb")
_FALLBACK_AFTER: int = int(os.environ.get("CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES", "5"))
_KEY_TTL: int = _RECOVERY_TIMEOUT * 3

# ── Lua scripts ───────────────────────────────────────────────────────────────
# All scripts loaded once at init; executed by SHA thereafter.
# KEYS and ARGV are explicit — no globals, no side effects outside named keys.

# Record a failure. Atomically increments the counter and transitions CLOSED→OPEN
# or HALF_OPEN→OPEN when threshold is crossed.
# KEYS: [state_key, failures_key, opened_at_key]
# ARGV: [threshold, ttl, current_epoch_seconds]
_LUA_RECORD_FAILURE = """
local state = redis.call('GET', KEYS[1]) or 'CLOSED'
if state == 'OPEN' then
  return state
end
local failures = redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
if state == 'HALF_OPEN' then
  redis.call('SET', KEYS[1], 'OPEN', 'EX', ARGV[2])
  redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[2])
  return 'OPEN'
end
if tonumber(failures) >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], 'OPEN', 'EX', ARGV[2])
  redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[2])
  return 'OPEN'
end
return state
"""

# Record a success. If HALF_OPEN, transition to CLOSED and release the probe
# slot. If CLOSED, reset the failure counter.
# KEYS: [state_key, failures_key, half_open_in_flight_key, opened_at_key]
# ARGV: [ttl]
_LUA_RECORD_SUCCESS = """
local state = redis.call('GET', KEYS[1]) or 'CLOSED'
if state == 'HALF_OPEN' then
  redis.call('DEL', KEYS[3])
  redis.call('SET', KEYS[1], 'CLOSED', 'EX', ARGV[1])
  redis.call('DEL', KEYS[2])
  redis.call('DEL', KEYS[4])
  return 'CLOSED'
end
redis.call('DEL', KEYS[2])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return state
"""

# Check availability and attempt OPEN→HALF_OPEN transition if recovery window
# has elapsed. Uses SET NX so only one worker wins the probe slot.
# KEYS: [state_key, opened_at_key, half_open_in_flight_key]
# ARGV: [recovery_timeout, ttl, current_epoch_seconds]
_LUA_TRY_AVAILABILITY = """
local state = redis.call('GET', KEYS[1]) or 'CLOSED'
if state == 'CLOSED' then
  return 'CLOSED'
end
if state == 'HALF_OPEN' then
  local inflight = redis.call('EXISTS', KEYS[3])
  if inflight == 1 then
    return 'OPEN'
  end
  return 'HALF_OPEN'
end
-- state == OPEN: check recovery window
local opened_at = tonumber(redis.call('GET', KEYS[2])) or 0
local elapsed = tonumber(ARGV[3]) - opened_at
if elapsed < tonumber(ARGV[1]) then
  return 'OPEN'
end
-- Recovery window elapsed: try to acquire the probe slot (NX)
local acquired = redis.call('SET', KEYS[3], '1', 'NX', 'EX', ARGV[2])
if acquired then
  redis.call('SET', KEYS[1], 'HALF_OPEN', 'EX', ARGV[2])
  return 'HALF_OPEN'
end
-- Another worker already holds the probe slot
return 'OPEN'
"""


class RedisCircuitBreaker:
    """
    Distributed circuit breaker backed by Redis.
    Drop-in replacement for the in-process CircuitBreaker.

    Falls back to in-process state if Redis is unreachable for
    CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES consecutive operations.
    Never raises on Redis failures — degraded mode is preferred over
    crashing the eval pipeline.
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        key_prefix: str = _KEY_PREFIX,
        failure_threshold: int = _FAILURE_THRESHOLD,
        recovery_timeout: int = _RECOVERY_TIMEOUT,
        fallback_after: int = _FALLBACK_AFTER,
    ) -> None:
        self._redis_url = redis_url
        self._prefix = key_prefix
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._key_ttl = recovery_timeout * 3
        self._fallback_after = fallback_after

        self._client: Optional["redis.asyncio.Redis"] = None  # type: ignore[name-defined]
        self._sha_failure: Optional[str] = None
        self._sha_success: Optional[str] = None
        self._sha_availability: Optional[str] = None

        # Consecutive Redis error counter — trips fallback mode
        self._consecutive_redis_errors: int = 0
        self._fallback_mode: bool = False

        # In-process fallback state (per-provider failure counts)
        self._fallback_failures: Dict[str, int] = {}
        self._fallback_opened_at: Dict[str, float] = {}
        self._fallback_state: Dict[str, str] = {}

    # ── Key builders ──────────────────────────────────────────────────────────

    def _key(self, provider: str, suffix: str) -> str:
        return f"{self._prefix}:{provider}:{suffix}"

    def _all_keys(self, provider: str):
        return (
            self._key(provider, "state"),
            self._key(provider, "failures"),
            self._key(provider, "opened_at"),
            self._key(provider, "half_open_in_flight"),
        )

    # ── Redis client lifecycle ────────────────────────────────────────────────

    async def _get_client(self) -> "redis.asyncio.Redis":  # type: ignore[name-defined]
        if self._client is None:
            import redis.asyncio as aioredis  # type: ignore[import]
            self._client = aioredis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
            )
            # Load Lua scripts and cache SHAs
            self._sha_failure = await self._client.script_load(_LUA_RECORD_FAILURE)
            self._sha_success = await self._client.script_load(_LUA_RECORD_SUCCESS)
            self._sha_availability = await self._client.script_load(_LUA_TRY_AVAILABILITY)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── Redis error tracking ──────────────────────────────────────────────────

    def _redis_ok(self) -> None:
        if self._fallback_mode:
            self._fallback_mode = False
            logger.info("[CB-Redis] Redis reconnected — exiting fallback mode")
        self._consecutive_redis_errors = 0

    def _redis_err(self, provider: str, exc: Exception) -> None:
        self._consecutive_redis_errors += 1
        if self._consecutive_redis_errors >= self._fallback_after and not self._fallback_mode:
            self._fallback_mode = True
            logger.warning(
                "[CB-Redis] Redis unreachable for %d consecutive ops on provider=%s "
                "— entering in-process fallback mode (exc=%s)",
                self._consecutive_redis_errors,
                provider,
                type(exc).__name__,
            )

    # ── In-process fallback logic ─────────────────────────────────────────────

    def _fb_is_available(self, provider: str) -> bool:
        state = self._fallback_state.get(provider, "CLOSED")
        if state == "CLOSED":
            return True
        if state == "OPEN":
            opened = self._fallback_opened_at.get(provider, 0.0)
            if time.monotonic() - opened >= self._recovery_timeout:
                self._fallback_state[provider] = "HALF_OPEN"
                return True
            return False
        return True  # HALF_OPEN

    def _fb_record_failure(self, provider: str) -> None:
        state = self._fallback_state.get(provider, "CLOSED")
        if state == "OPEN":
            return
        if state == "HALF_OPEN":
            self._fallback_state[provider] = "OPEN"
            self._fallback_opened_at[provider] = time.monotonic()
            return
        count = self._fallback_failures.get(provider, 0) + 1
        self._fallback_failures[provider] = count
        if count >= self._failure_threshold:
            self._fallback_state[provider] = "OPEN"
            self._fallback_opened_at[provider] = time.monotonic()
            self._fallback_failures[provider] = 0

    def _fb_record_success(self, provider: str) -> None:
        self._fallback_failures[provider] = 0
        if self._fallback_state.get(provider) == "HALF_OPEN":
            self._fallback_state[provider] = "CLOSED"
            self._fallback_opened_at.pop(provider, None)

    def _fb_get_state(self, provider: str) -> str:
        return self._fallback_state.get(provider, "CLOSED")

    # ── Public async interface ────────────────────────────────────────────────

    async def is_available(self, provider: str) -> bool:
        """Return True if the provider's circuit allows a request through."""
        if self._fallback_mode:
            return self._fb_is_available(provider)
        try:
            client = await self._get_client()
            state_key, _, opened_at_key, inflight_key = self._all_keys(provider)
            now = str(time.time())
            result = await client.evalsha(
                self._sha_availability,
                3,
                state_key,
                opened_at_key,
                inflight_key,
                str(self._recovery_timeout),
                str(self._key_ttl),
                now,
            )
            self._redis_ok()
            available = result in ("CLOSED", "HALF_OPEN")
            if result == "HALF_OPEN" and not available:
                pass  # another worker has probe slot
            logger.debug("[CB-Redis] provider=%s availability=%s state=%s", provider, available, result)
            return available
        except Exception as exc:
            self._redis_err(provider, exc)
            return self._fb_is_available(provider)

    async def record_success(self, provider: str) -> None:
        """Record a successful inference call; may transition HALF_OPEN → CLOSED."""
        if self._fallback_mode:
            self._fb_record_success(provider)
            return
        try:
            client = await self._get_client()
            state_key, failures_key, inflight_key, opened_at_key = self._all_keys(provider)
            result = await client.evalsha(
                self._sha_success,
                4,
                state_key,
                failures_key,
                inflight_key,
                opened_at_key,
                str(self._key_ttl),
            )
            self._redis_ok()
            if result == "CLOSED":
                logger.info("[CB-Redis] provider=%s → CLOSED (recovered)", provider)
        except Exception as exc:
            self._redis_err(provider, exc)
            self._fb_record_success(provider)

    async def record_failure(self, provider: str) -> None:
        """Record a failed inference call; may trip CLOSED → OPEN."""
        if self._fallback_mode:
            self._fb_record_failure(provider)
            return
        try:
            client = await self._get_client()
            state_key, failures_key, opened_at_key, _ = self._all_keys(provider)
            now = str(time.time())
            result = await client.evalsha(
                self._sha_failure,
                3,
                state_key,
                failures_key,
                opened_at_key,
                str(self._failure_threshold),
                str(self._key_ttl),
                now,
            )
            self._redis_ok()
            if result == "OPEN":
                logger.warning(
                    "[CB-Redis] provider=%s → OPEN (threshold=%d)",
                    provider, self._failure_threshold,
                )
        except Exception as exc:
            self._redis_err(provider, exc)
            self._fb_record_failure(provider)

    async def get_state(self, provider: str) -> str:
        """Return current circuit state: CLOSED | OPEN | HALF_OPEN."""
        if self._fallback_mode:
            return self._fb_get_state(provider)
        try:
            client = await self._get_client()
            state = await client.get(self._key(provider, "state"))
            self._redis_ok()
            return state or "CLOSED"
        except Exception as exc:
            self._redis_err(provider, exc)
            return self._fb_get_state(provider)

    async def get_all_states(self) -> Dict[str, str]:
        """Return {provider_name: state} for all active providers."""
        from src.inference.providers import get_active_providers  # avoid circular import

        result = {}
        for provider in get_active_providers():
            result[provider.name] = await self.get_state(provider.name)
        return result

    async def reset(self, provider: str) -> None:
        """Force-reset a provider's circuit to CLOSED. Admin/test use only."""
        state_key, failures_key, opened_at_key, inflight_key = self._all_keys(provider)
        self._fallback_state.pop(provider, None)
        self._fallback_failures.pop(provider, None)
        self._fallback_opened_at.pop(provider, None)
        if self._fallback_mode:
            return
        try:
            client = await self._get_client()
            await client.delete(state_key, failures_key, opened_at_key, inflight_key)
            self._redis_ok()
            logger.info("[CB-Redis] provider=%s reset to CLOSED", provider)
        except Exception as exc:
            self._redis_err(provider, exc)


# ── Module-level singleton (created by _build_circuit_breaker in circuit_breaker.py) ──
_instance: Optional[RedisCircuitBreaker] = None


def get_instance() -> RedisCircuitBreaker:
    """Return the shared RedisCircuitBreaker instance (must be initialized first)."""
    if _instance is None:
        raise RuntimeError("RedisCircuitBreaker not initialized — call initialize() first")
    return _instance


async def initialize(redis_url: str) -> RedisCircuitBreaker:
    """Create and warm up the global Redis circuit breaker instance."""
    global _instance
    _instance = RedisCircuitBreaker(redis_url=redis_url)
    # Eagerly attempt connection so errors surface at startup, not first request
    try:
        await _instance._get_client()
        logger.info("[CB-Redis] Connected to Redis at %s", redis_url)
    except Exception as exc:
        logger.warning(
            "[CB-Redis] Could not connect to Redis at startup (%s) — "
            "running in in-process fallback mode", exc,
        )
        _instance._fallback_mode = True
        _instance._consecutive_redis_errors = _instance._fallback_after
    return _instance
