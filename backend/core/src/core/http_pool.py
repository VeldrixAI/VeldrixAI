"""Singleton httpx pool for internal VeldrixAI service calls (connectors, auth).

Eliminates per-request TCP handshake overhead (~40-120ms) for every call to the
connectors and auth services.  Lazily initialises on first use so tests work
without calling init_internal_pool(); production startup calls it explicitly via
warmup() to pre-warm the pool before the first real request.
"""
from __future__ import annotations

import os

import httpx

# Aggressive pooling for sub-500ms SLA:
#   100 max connections with 50 keepalive for sustained throughput
#   Tight timeouts: 200ms connect, 1s read (was 5s), 500ms write, 200ms pool
#   Keepalive 60s keeps connections warm across requests
_LIMITS = httpx.Limits(
    max_connections=100,
    max_keepalive_connections=50,
    keepalive_expiry=60.0,
)
_TIMEOUT = httpx.Timeout(connect=0.2, read=1.0, write=0.5, pool=0.2)

_client: httpx.AsyncClient | None = None


def _internal_headers() -> dict[str, str]:
    """Default headers for service-to-service calls.

    Connectors' ``internal/*`` routes (audit-write, chain-health, enforcement-mode,
    preflight) require the shared ``INTERNAL_SERVICE_TOKEN`` in ``X-Internal-Token``
    (F-UNAUTH-1). Every internal call goes through this pool, so we attach the token
    once here. Unset → empty header → connectors fails safe (503/401); production
    sets the same token on both services. Endpoints that don't check it ignore it.
    """
    return {"X-Internal-Token": os.getenv("INTERNAL_SERVICE_TOKEN", "")}


def get_internal_client() -> httpx.AsyncClient:
    """Return the shared pool client, initialising it lazily if needed."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(limits=_LIMITS, timeout=_TIMEOUT, headers=_internal_headers())
    return _client


async def init_internal_pool() -> None:
    """Pre-create the pool at startup (preferred over lazy init in production)."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(limits=_LIMITS, timeout=_TIMEOUT, headers=_internal_headers())


async def close_internal_pool() -> None:
    """Close the pool on application shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
