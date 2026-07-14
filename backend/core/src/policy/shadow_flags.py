"""Runtime attach/detach flags for the Phase-6 shadow integration — TRUE hot-detach.

Phase-6 closeout (RECON-CLOSE.md Finding 1): the kill switch and sample gate were read
per-request but backed by ``os.getenv``, whose values are frozen at container creation —
so "flip the kill switch" actually meant "recreate the container", a restart that itself
disrupts the request path the switch exists to protect. This module replaces the backing
store with **core's existing Redis** (RECON-CLOSE Finding 2 — same ``redis[hiredis]``
package, same ``REDIS_URL``, no new store), making the flip a runtime act:

    veldrix:shadow:engine_enabled   "1"/"0"      global kill switch
    veldrix:shadow:sample_pct       "0".."100"   traffic sample rate

Read semantics (the request path must stay ~0-cost — the impact guard re-asserts it):

  * :func:`current_flags` is **synchronous and allocation-light**: it returns the local
    cached resolution. At most once per ``ENGINE_SHADOW_FLAG_CACHE_TTL_S`` (default 2 s)
    it schedules ONE background refresh task — the request path never awaits Redis.
    Max flip propagation delay ≈ cache TTL + one Redis read (bounded by
    ``ENGINE_SHADOW_FLAG_REDIS_TIMEOUT_S``, default 0.5 s) — documented in the runbook.
  * **Stale-while-revalidate:** after TTL expiry the last-known resolution keeps serving
    until the in-flight refresh lands, so no request ever blocks on the flag store.

Resolution precedence (per key):

  1. Redis key present  → its value (the runtime flag — authoritative).
  2. Redis key absent   → the env default (``ENGINE_SHADOW_ENABLED`` /
     ``ENGINE_SHADOW_SAMPLE_PCT``) — static config remains the baseline, so the
     first-run posture is unchanged: nothing set anywhere = OFF / 0 %.
  3. Redis **unreachable** → **fail-safe: detached** (enabled=False, 0 %), regardless of
     env. A flag-store outage must never silently leave the engine attached. The posture
    is visible as ``source == "failsafe"`` and counted by the dispatch gate as the
    ``skipped_failsafe`` outcome. Recovery is automatic on the next successful refresh.

This module changes only HOW attachment is toggled. It does not touch engine decisions,
pillar scoring, actuation (``enforced:false`` stays forced), or any worker→response path.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("veldrix.policy.shadow.flags")

KEY_ENABLED = "veldrix:shadow:engine_enabled"
KEY_SAMPLE_PCT = "veldrix:shadow:sample_pct"

_TRUTHY = ("1", "true", "yes", "on")


def _cache_ttl_s() -> float:
    return float(os.getenv("ENGINE_SHADOW_FLAG_CACHE_TTL_S", "2"))


def _redis_timeout_s() -> float:
    return float(os.getenv("ENGINE_SHADOW_FLAG_REDIS_TIMEOUT_S", "0.5"))


@dataclass(frozen=True)
class FlagState:
    """One coherent resolution of the runtime flags.

    ``source`` is ``"redis"`` (resolved from the flag store; absent keys fell back to
    env defaults), ``"env"`` (no Redis resolution yet — process-start posture), or
    ``"failsafe"`` (flag store unreachable → forced detached).
    """

    enabled: bool
    sample_pct: float
    source: str


# ── local cache (single event loop; refreshed by at most one task at a time) ────────
_state: Optional[FlagState] = None
_expires_at: float = 0.0
_refresh_task: Optional["asyncio.Task"] = None
_client = None  # redis.asyncio.Redis — lazily built from REDIS_URL


# ── env defaults (the pre-closeout static config, now the baseline) ─────────────────

def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in _TRUTHY


def _env_enabled() -> bool:
    return _truthy(os.getenv("ENGINE_SHADOW_ENABLED"))


def _env_pct() -> float:
    return _clamp_pct(os.getenv("ENGINE_SHADOW_SAMPLE_PCT", "0"))


def _clamp_pct(raw) -> float:
    try:
        pct = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, pct))


# ── the request-path read (sync, cached, never awaits) ──────────────────────────────

def current_flags() -> FlagState:
    """Return the effective flags. Called per-request at the dispatch decision point.

    Never blocks: serves the local cache (or env defaults before the first resolution)
    and schedules a background refresh at most once per TTL. Outside a running event
    loop (sync tests/tools) no refresh can be scheduled and the env defaults rule —
    identical to the pre-closeout behavior.
    """
    if time.monotonic() >= _expires_at:
        _schedule_refresh()
    if _state is not None:
        return _state
    return FlagState(_env_enabled(), _env_pct(), "env")


def _schedule_refresh() -> None:
    global _refresh_task
    if _refresh_task is not None and not _refresh_task.done():
        return  # one in-flight refresh at a time
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no loop → cannot (and need not) refresh; env defaults serve
    _refresh_task = loop.create_task(refresh())


# ── the flag-store read (off the request path) ──────────────────────────────────────

def _get_client():
    global _client
    if _client is None:
        import redis.asyncio as aioredis  # core's existing dependency (requirements.txt)

        timeout = _redis_timeout_s()
        _client = aioredis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
            socket_connect_timeout=timeout,
            socket_timeout=timeout,
        )
    return _client


async def refresh() -> FlagState:
    """Resolve the flags from Redis into the local cache. Fail-safe: detached.

    Any error — connection refused, timeout, protocol fault — resolves to
    ``FlagState(False, 0.0, "failsafe")``. The cache expiry is always advanced so a
    down flag store is re-probed at TTL cadence, not per request.
    """
    global _state, _expires_at
    try:
        raw = await asyncio.wait_for(
            _get_client().mget(KEY_ENABLED, KEY_SAMPLE_PCT),
            timeout=_redis_timeout_s(),
        )
        raw_enabled, raw_pct = raw[0], raw[1]
        new = FlagState(
            enabled=_truthy(raw_enabled) if raw_enabled is not None else _env_enabled(),
            sample_pct=_clamp_pct(raw_pct) if raw_pct is not None else _env_pct(),
            source="redis",
        )
        if _state is not None and _state.source == "failsafe":
            logger.info(
                "policy.shadow.flags recovered from fail-safe → enabled=%s pct=%s",
                new.enabled, new.sample_pct,
            )
        _state = new
    except Exception as exc:  # flag store unreachable → NEVER leave the engine attached
        if _state is None or _state.source != "failsafe":
            logger.warning(
                "policy.shadow.flags store unreachable (%s: %s) → FAIL-SAFE: engine "
                "detached (enabled=False, 0%%)", type(exc).__name__, exc,
            )
        _state = FlagState(False, 0.0, "failsafe")
    finally:
        _expires_at = time.monotonic() + _cache_ttl_s()
    return _state


# ── the flip (ops/endpoint side — NO restart, NO recreate, NO deploy) ───────────────

async def set_flags(
    *, enabled: Optional[bool] = None, sample_pct: Optional[float] = None
) -> FlagState:
    """Write the runtime flags to Redis, then refresh the local cache immediately.

    The writing process sees the new posture instantly; every other process converges
    within one cache TTL + one Redis read. Raises on write failure (the endpoint maps
    that to a 503) — note that a flag store down means the engine is already fail-safe
    detached everywhere, so an unwritable flip-off is not an attached engine.
    """
    client = _get_client()
    pairs = {}
    if enabled is not None:
        pairs[KEY_ENABLED] = "1" if enabled else "0"
    if sample_pct is not None:
        pairs[KEY_SAMPLE_PCT] = str(_clamp_pct(sample_pct))
    if pairs:
        await asyncio.wait_for(client.mset(pairs), timeout=_redis_timeout_s())
        logger.info("policy.shadow.flags set %s", pairs)
    return await refresh()


async def clear_flags() -> FlagState:
    """Delete the runtime keys — the env defaults become effective again."""
    client = _get_client()
    await asyncio.wait_for(
        client.delete(KEY_ENABLED, KEY_SAMPLE_PCT), timeout=_redis_timeout_s()
    )
    logger.info("policy.shadow.flags cleared → env defaults")
    return await refresh()


# ── test/ops seams ───────────────────────────────────────────────────────────────────

def invalidate() -> None:
    """Force the next :func:`current_flags` to schedule a refresh."""
    global _expires_at
    _expires_at = 0.0


def reset_for_tests() -> None:
    """Drop all module state (cache, refresh task, client). Sync-safe."""
    global _state, _expires_at, _refresh_task, _client
    _state = None
    _expires_at = 0.0
    if _refresh_task is not None and not _refresh_task.done():
        _refresh_task.cancel()
    _refresh_task = None
    if _client is not None:
        client, _client = _client, None
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(client.aclose())
        except RuntimeError:
            pass  # no loop — connection objects are GC'd; fine for tests

async def close() -> None:
    """Close the flag-store client on application shutdown (lifespan hook)."""
    global _client, _refresh_task
    if _refresh_task is not None and not _refresh_task.done():
        _refresh_task.cancel()
    _refresh_task = None
    if _client is not None:
        client, _client = _client, None
        await client.aclose()
