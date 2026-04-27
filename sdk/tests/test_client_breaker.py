"""Tests for ClientCircuitBreaker."""

import time
import pytest

from veldrixai._transport.rate_limiter import ClientCircuitBreaker


def test_breaker_starts_closed():
    cb = ClientCircuitBreaker(threshold=3, recovery_seconds=30.0)
    assert not cb.is_open()
    assert cb.stats()["breaker_state"] == "CLOSED"


def test_breaker_trips_at_threshold():
    cb = ClientCircuitBreaker(threshold=3, recovery_seconds=30.0)
    for _ in range(3):
        cb.record_failure()
    assert cb.is_open()
    assert cb.stats()["breaker_trips_total"] == 1


def test_breaker_does_not_trip_below_threshold():
    cb = ClientCircuitBreaker(threshold=5, recovery_seconds=30.0)
    for _ in range(4):
        cb.record_failure()
    assert not cb.is_open()


def test_breaker_resets_on_success():
    cb = ClientCircuitBreaker(threshold=2, recovery_seconds=30.0)
    cb.record_failure()
    cb.record_success()  # resets consecutive counter
    cb.record_failure()
    assert not cb.is_open()  # only 1 consecutive failure after reset


def test_breaker_half_open_after_recovery(monkeypatch):
    """After recovery_seconds, breaker allows one probe (HALF_OPEN)."""
    cb = ClientCircuitBreaker(threshold=2, recovery_seconds=0.05)
    cb.record_failure()
    cb.record_failure()
    assert cb.is_open()

    time.sleep(0.1)  # wait out recovery window
    # is_open() re-evaluates state → transitions to HALF_OPEN
    is_open = cb.is_open()
    assert not is_open, "Should be in HALF_OPEN after recovery"

    # Probe success → CLOSED
    cb.record_success()
    assert not cb.is_open()
    assert cb.stats()["breaker_state"] == "CLOSED"


def test_breaker_half_open_to_open_on_failure():
    """Failure during HALF_OPEN sends it back to OPEN."""
    cb = ClientCircuitBreaker(threshold=2, recovery_seconds=0.05)
    cb.record_failure()
    cb.record_failure()
    time.sleep(0.1)
    # Now in HALF_OPEN
    cb.is_open()  # triggers transition
    cb.record_failure()
    assert cb.is_open()


def test_breaker_drop_counter():
    cb = ClientCircuitBreaker(threshold=2, recovery_seconds=30.0)
    cb.record_failure()
    cb.record_failure()
    cb.record_drop()
    cb.record_drop()
    assert cb.stats()["breaker_dropped_total"] == 2


def test_breaker_10_consecutive_503(monkeypatch):
    """10 consecutive 503s → OPEN → 30s later HALF_OPEN → success → CLOSED."""
    cb = ClientCircuitBreaker(threshold=10, recovery_seconds=0.05)
    for _ in range(10):
        cb.record_failure()
    assert cb.is_open()
    assert cb.stats()["breaker_trips_total"] == 1

    time.sleep(0.1)
    cb.is_open()  # trigger HALF_OPEN
    assert cb.stats()["breaker_state"] == "HALF_OPEN"

    cb.record_success()
    assert cb.stats()["breaker_state"] == "CLOSED"
