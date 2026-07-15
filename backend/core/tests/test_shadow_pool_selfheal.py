"""Phase-6 closeout — dedicated-pool WEDGE self-heal.

Live finding (documented in PHASE6_CLOSED.md): a host-level clock jump (WSL2
suspend/resume during the closeout evidence session) wedged the long-lived httpx
client's internal pool — every acquire raised ``PoolTimeout`` even with the pool
idle, permanently, until a process restart. The shed path behaved correctly
throughout (fast fail, counted, request path untouched), but shadow recording was
dead until restart.

The self-heal detector uses the **wedge signature**: a ``PoolTimeout`` while our own
tracked in-flight is at/below the connection cap. A healthy pool cannot refuse an
acquire with nothing queued; a wedged one refuses even a single quiet request.
(A bare consecutive-timeout streak was tried first and fired during genuine hard
saturation — live burst testing, 2026-07-15 — so timeouts under real queueing,
in-flight above the cap, are deliberately NOT counted.) These tests pin:

  * the wedge signature recycles the client (a NEW client object is built),
  * saturation-shaped PoolTimeouts (in-flight above cap) never advance the counter,
  * any success resets the streak,
  * non-PoolTimeout failures (connectors down) never trigger a recycle,
  * the recycle is counted (``pool_recycled`` outcome) and worker-only.
"""

from __future__ import annotations

import httpx
import pytest

from src.policy import shadow_pool
from src.telemetry import policy_metrics as metrics


@pytest.fixture(autouse=True)
def _fresh_pool():
    shadow_pool._consecutive_wedge_signals = 0
    shadow_pool._in_flight = 0
    yield
    shadow_pool._consecutive_wedge_signals = 0
    shadow_pool._in_flight = 0


@pytest.fixture
def outcomes(monkeypatch):
    seen = []
    monkeypatch.setattr(metrics, "record_shadow_outcome", lambda o: seen.append(o))
    return seen


def test_wedge_signature_recycles_client(outcomes):
    """Quiet-pool PoolTimeouts (in-flight <= cap, no successes) = wedge → recycle."""
    first = shadow_pool.get_shadow_client()
    shadow_pool._in_flight = 1  # a single quiet request, nothing queued
    for _ in range(shadow_pool._RECYCLE_AFTER):
        shadow_pool.note_pool_outcome(httpx.PoolTimeout("acquire timed out"))
    second = shadow_pool.get_shadow_client()
    assert second is not first                       # client rebuilt
    assert outcomes == ["pool_recycled"]             # recycle counted, exactly once
    assert shadow_pool._consecutive_wedge_signals == 0


def test_saturation_pooltimeouts_never_recycle(outcomes):
    """PoolTimeouts under real queueing (in-flight above cap) are ordinary shed."""
    first = shadow_pool.get_shadow_client()
    shadow_pool._in_flight = shadow_pool.max_connections() + 7  # genuine queue
    for _ in range(shadow_pool._RECYCLE_AFTER * 5):
        shadow_pool.note_pool_outcome(httpx.PoolTimeout("saturated"))
    assert shadow_pool.get_shadow_client() is first  # never recycled
    assert outcomes == []
    assert shadow_pool._consecutive_wedge_signals == 0


def test_success_resets_wedge_streak(outcomes):
    first = shadow_pool.get_shadow_client()
    shadow_pool._in_flight = 1
    for _ in range(5):
        for _ in range(shadow_pool._RECYCLE_AFTER - 1):
            shadow_pool.note_pool_outcome(httpx.PoolTimeout("blip"))
        shadow_pool.note_pool_outcome(None)          # a write landed → healthy pool
    assert shadow_pool.get_shadow_client() is first
    assert outcomes == []


def test_non_pooltimeout_failures_never_recycle(outcomes):
    first = shadow_pool.get_shadow_client()
    shadow_pool._in_flight = 1
    for _ in range(shadow_pool._RECYCLE_AFTER * 2):
        shadow_pool.note_pool_outcome(httpx.ConnectError("connectors down"))
    assert shadow_pool.get_shadow_client() is first
    assert outcomes == []
