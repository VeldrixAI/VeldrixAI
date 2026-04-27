"""Per-provider circuit breaker for inference routing.

Implements a three-state machine per provider:
  CLOSED    — normal operation, all requests pass through
  OPEN      — provider is failing; requests are skipped until recovery timeout
  HALF_OPEN — testing recovery; limited requests are allowed through

The active backend is selected at startup by `initialize_backend()`:
  CIRCUIT_BREAKER_BACKEND=redis   → RedisCircuitBreaker (shared across workers)
  CIRCUIT_BREAKER_BACKEND=memory  → in-process _ProviderCircuit dict (default)

The in-process implementation is always kept as the documented Redis fallback.
When Redis is unreachable, RedisCircuitBreaker transparently degrades to
in-process mode and logs a WARNING.
"""

from __future__ import annotations

import logging
import os
import time
from enum import Enum
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ── Configuration (from environment, with sensible defaults) ─────────────────
FAILURE_THRESHOLD: int = int(os.environ.get("CIRCUIT_FAILURE_THRESHOLD", "3"))
RECOVERY_TIMEOUT: int = int(os.environ.get("CIRCUIT_RECOVERY_TIMEOUT", "60"))
HALF_OPEN_SUCCESS_REQUIRED: int = int(
    os.environ.get("CIRCUIT_HALF_OPEN_SUCCESS_REQUIRED", "2")
)


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class _ProviderCircuit:
    """Mutable state machine for a single provider's circuit breaker."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.half_open_success_count: int = 0
        self.opened_at: Optional[float] = None

    def is_available(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            elapsed = time.monotonic() - (self.opened_at or 0.0)
            if elapsed >= RECOVERY_TIMEOUT:
                self.state = CircuitState.HALF_OPEN
                self.half_open_success_count = 0
                logger.info(
                    "[CircuitBreaker] %s → HALF_OPEN (recovery window elapsed)", self.name
                )
                return True
            return False

        # HALF_OPEN — allow requests through to test recovery
        return True

    def record_success(self) -> None:
        if self.state == CircuitState.HALF_OPEN:
            self.half_open_success_count += 1
            if self.half_open_success_count >= HALF_OPEN_SUCCESS_REQUIRED:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.opened_at = None
                logger.info("[CircuitBreaker] %s → CLOSED (fully recovered)", self.name)
        else:
            # Reset consecutive failure counter on any success in CLOSED state
            self.failure_count = 0

    def record_failure(self) -> None:
        self.failure_count += 1
        if self.state == CircuitState.HALF_OPEN:
            # Any failure during HALF_OPEN resets the recovery attempt
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()
            logger.warning(
                "[CircuitBreaker] %s → OPEN (failed during HALF_OPEN probe)", self.name
            )
        elif self.failure_count >= FAILURE_THRESHOLD:
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()
            logger.warning(
                "[CircuitBreaker] %s → OPEN (failure_count=%d reached threshold=%d)",
                self.name,
                self.failure_count,
                FAILURE_THRESHOLD,
            )


# ── Module-level state store ─────────────────────────────────────────────────

_circuits: Dict[str, _ProviderCircuit] = {}


def _get_circuit(provider_name: str) -> _ProviderCircuit:
    if provider_name not in _circuits:
        _circuits[provider_name] = _ProviderCircuit(provider_name)
    return _circuits[provider_name]


# ── Public interface ─────────────────────────────────────────────────────────

def is_available(provider_name: str) -> bool:
    """Return True if the provider's circuit is CLOSED or HALF_OPEN."""
    return _get_circuit(provider_name).is_available()


def record_success(provider_name: str) -> None:
    """Record a successful inference call; may transition OPEN → HALF_OPEN → CLOSED."""
    _get_circuit(provider_name).record_success()


def record_failure(provider_name: str) -> None:
    """Record a failed inference call; may trip CLOSED → OPEN."""
    _get_circuit(provider_name).record_failure()


def get_all_states() -> Dict[str, str]:
    """Return a dict of {provider_name: circuit_state_str} for all active providers."""
    from src.inference.providers import get_active_providers  # avoid circular import at module level

    return {
        provider.name: _get_circuit(provider.name).state.value
        for provider in get_active_providers()
    }


# ── Async unified interface — used by router.py ───────────────────────────────
# When the Redis backend is initialised, these delegate to it.
# Otherwise they wrap the synchronous in-process implementation.

from typing import Optional as _Optional, TYPE_CHECKING as _TYPE_CHECKING
if _TYPE_CHECKING:
    from src.inference.circuit_breaker_redis import RedisCircuitBreaker

_redis_backend: "_Optional[RedisCircuitBreaker]" = None


async def initialize_backend(settings=None) -> None:
    """
    Wire the active circuit breaker backend based on config.
    Called from startup.warmup() after environment is loaded.
    """
    global _redis_backend
    if settings is None:
        from src.config import get_settings
        settings = get_settings()

    if settings.CIRCUIT_BREAKER_BACKEND == "redis":
        from src.inference.circuit_breaker_redis import initialize as _init_redis
        _redis_backend = await _init_redis(settings.REDIS_URL)
        logger.info("[CircuitBreaker] Backend=redis (url=%s)", settings.REDIS_URL)
    else:
        _redis_backend = None
        logger.info("[CircuitBreaker] Backend=memory (in-process)")


async def async_is_available(provider_name: str) -> bool:
    """Async: return True if provider circuit is CLOSED or HALF_OPEN."""
    if _redis_backend is not None:
        return await _redis_backend.is_available(provider_name)
    return is_available(provider_name)


async def async_record_success(provider_name: str) -> None:
    """Async: record a successful inference call."""
    if _redis_backend is not None:
        await _redis_backend.record_success(provider_name)
    else:
        record_success(provider_name)


async def async_record_failure(provider_name: str) -> None:
    """Async: record a failed inference call."""
    if _redis_backend is not None:
        await _redis_backend.record_failure(provider_name)
    else:
        record_failure(provider_name)


async def async_get_all_states() -> Dict[str, str]:
    """Async: return {provider_name: state} for all active providers."""
    if _redis_backend is not None:
        return await _redis_backend.get_all_states()
    return get_all_states()
