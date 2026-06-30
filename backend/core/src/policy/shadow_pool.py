"""A **dedicated** httpx connection pool for the shadow-engine worker's I/O.

RECON-INT.md core-tap finding ⚠C-2: core is DB-less, so the only shared resource the
out-of-band worker could contend for is the singleton internal HTTP pool
(``src.core.http_pool.get_internal_client`` — ``max_connections=100``). The locked
decision (reframed for core's reality) is **true isolation**: the worker draws from its
own small pool so engine load can *never* consume connections the request path needs.

This module owns that pool. It is:

  * **separate** from ``http_pool`` — a distinct ``httpx.AsyncClient`` with its own,
    small ``max_connections`` so worker overload exhausts *this* pool, not the request
    path's;
  * **bounded** — a small connection cap with a short ``pool`` acquisition timeout, so
    when the worker is saturated a write fails fast (``httpx.PoolTimeout``) and is
    counted, rather than queueing unboundedly;
  * **observable** — it tracks in-flight worker requests and publishes them as a gauge
    (worker-pool saturation), the metric that proves the worker is not starving anything;
  * **fail-safe** — it attaches the same ``X-Internal-Token`` the request path uses
    (``INTERNAL_SERVICE_TOKEN``) so connectors authorizes the shadow audit write
    identically; an unset token makes connectors fail closed (503/401), never open.

All tunables are env-overridable (request-time read at lazy init) and default to small,
conservative values appropriate for an out-of-band observer.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Optional

import httpx

from src.telemetry import policy_metrics as metrics

# Small, deliberately-constrained pool: an observer must never look like a second
# request path. Defaults are intentionally far below http_pool's 100/50.
_MAX_CONNECTIONS = int(os.getenv("ENGINE_SHADOW_POOL_MAX_CONNECTIONS", "5"))
_MAX_KEEPALIVE = int(os.getenv("ENGINE_SHADOW_POOL_MAX_KEEPALIVE", "2"))
# Tight timeouts: connect/read/write small; pool acquisition very short so a saturated
# worker sheds (PoolTimeout) fast rather than blocking on connection acquisition.
_CONNECT_TIMEOUT = float(os.getenv("ENGINE_SHADOW_POOL_CONNECT_TIMEOUT_S", "0.2"))
_READ_TIMEOUT = float(os.getenv("ENGINE_SHADOW_POOL_READ_TIMEOUT_S", "1.0"))
_WRITE_TIMEOUT = float(os.getenv("ENGINE_SHADOW_POOL_WRITE_TIMEOUT_S", "0.5"))
_POOL_TIMEOUT = float(os.getenv("ENGINE_SHADOW_POOL_ACQUIRE_TIMEOUT_S", "0.25"))

_client: Optional[httpx.AsyncClient] = None
_in_flight: int = 0


def _build_client() -> httpx.AsyncClient:
    limits = httpx.Limits(
        max_connections=_MAX_CONNECTIONS,
        max_keepalive_connections=_MAX_KEEPALIVE,
        keepalive_expiry=30.0,
    )
    timeout = httpx.Timeout(
        connect=_CONNECT_TIMEOUT,
        read=_READ_TIMEOUT,
        write=_WRITE_TIMEOUT,
        pool=_POOL_TIMEOUT,
    )
    headers = {"X-Internal-Token": os.getenv("INTERNAL_SERVICE_TOKEN", "")}
    return httpx.AsyncClient(limits=limits, timeout=timeout, headers=headers)


def get_shadow_client() -> httpx.AsyncClient:
    """Return the dedicated worker client, initialising it lazily if needed.

    Distinct object from ``http_pool.get_internal_client()`` — the isolation guarantee
    is structural: the two never share a connection pool.
    """
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def max_connections() -> int:
    """The dedicated pool's hard connection ceiling (used by tests/observability)."""
    return _MAX_CONNECTIONS


def in_flight() -> int:
    """Current number of in-flight worker requests on the dedicated pool."""
    return _in_flight


@asynccontextmanager
async def track_in_flight():
    """Increment/decrement the worker-pool in-flight gauge around one worker request."""
    global _in_flight
    _in_flight += 1
    metrics.set_shadow_pool_inflight(_in_flight)
    try:
        yield
    finally:
        _in_flight -= 1
        metrics.set_shadow_pool_inflight(_in_flight)


async def reset_shadow_pool() -> None:
    """Close + drop the dedicated pool (tests/ops). Safe to call when uninitialised."""
    global _client, _in_flight
    if _client is not None:
        await _client.aclose()
        _client = None
    _in_flight = 0
    metrics.set_shadow_pool_inflight(0)


async def close_shadow_pool() -> None:
    """Close the dedicated pool on application shutdown (lifespan hook)."""
    await reset_shadow_pool()
