"""Singleton httpx pool for internal VeldrixAI service calls (connectors, auth).

Eliminates per-request TCP handshake overhead (~40-120ms) for every call to the
connectors and auth services.  Lazily initialises on first use so tests work
without calling init_internal_pool(); production startup calls it explicitly via
warmup() to pre-warm the pool before the first real request.
"""
from __future__ import annotations

import httpx

_LIMITS = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=10,
    keepalive_expiry=30.0,
)
_TIMEOUT = httpx.Timeout(connect=1.0, read=5.0, write=2.0, pool=0.5)

_client: httpx.AsyncClient | None = None


def get_internal_client() -> httpx.AsyncClient:
    """Return the shared pool client, initialising it lazily if needed."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(limits=_LIMITS, timeout=_TIMEOUT)
    return _client


async def init_internal_pool() -> None:
    """Pre-create the pool at startup (preferred over lazy init in production)."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(limits=_LIMITS, timeout=_TIMEOUT)


async def close_internal_pool() -> None:
    """Close the pool on application shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
