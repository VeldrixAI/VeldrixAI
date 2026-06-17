"""Cached, fail-safe lookup of a tenant's enforcement mode (Part B / B.3 consumer).

The per-tenant ``policy_enforcement_mode`` lives in the connectors DB (Phase 1
decision: policy storage lives in connectors, not core, not auth). The mode is read at
*request time* — that is what makes an enforce→shadow rollback **immediate** (a flag
read, no deploy, no migration) — but it must stay off the sub-millisecond decision path,
so reads are cached with a short TTL.

Two safety invariants:

  * **Fail-safe to shadow.** Any lookup failure (connectors down, timeout, malformed
    response, unknown mode string) resolves to ``shadow``. A lookup error must NEVER
    silently escalate a tenant *into* enforce — degradation can only ever de-gate.
  * **Bounded staleness.** The cache TTL bounds how long a rollback takes to take
    effect everywhere (default 5s); see ``POLICY_MODE_CACHE_TTL_S``.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Dict, Optional, Tuple

from src.policy.schema import DEFAULT_ENFORCEMENT_MODE, EnforcementMode

logger = logging.getLogger("veldrix.policy.mode_client")

CONNECTORS_URL = os.getenv(
    "VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002")
)
_MODE_PATH = "/api/policy/internal/enforcement-mode"
_CACHE_TTL_S = float(os.getenv("POLICY_MODE_CACHE_TTL_S", "5"))

# (tenant_id, policy_id) -> (mode, expires_at_monotonic)
_cache: Dict[Tuple[Optional[str], str], Tuple[EnforcementMode, float]] = {}


def _coerce(mode_str: Optional[str]) -> EnforcementMode:
    """Map a wire string to an EnforcementMode; unknown/None → fail-safe shadow."""
    try:
        return EnforcementMode(mode_str)
    except (ValueError, TypeError):
        if mode_str is not None:
            logger.warning("policy.mode_client.unknown_mode=%r → shadow (fail-safe)", mode_str)
        return DEFAULT_ENFORCEMENT_MODE


async def get_mode(tenant_id: Optional[str], policy_id: str) -> EnforcementMode:
    """Return the tenant's enforcement mode for ``policy_id`` (cached, fail-safe shadow)."""
    key = (tenant_id, policy_id)
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None and cached[1] > now:
        return cached[0]

    mode = DEFAULT_ENFORCEMENT_MODE
    try:
        from src.core.http_pool import get_internal_client

        client = get_internal_client()
        resp = await client.get(
            f"{CONNECTORS_URL}{_MODE_PATH}",
            params={"tenant_id": tenant_id or "", "policy_id": policy_id},
        )
        if resp.status_code == 200:
            mode = _coerce(resp.json().get("mode"))
        elif resp.status_code == 404:
            mode = DEFAULT_ENFORCEMENT_MODE  # no binding yet → shadow (never gates)
        else:
            logger.warning(
                "policy.mode_client.lookup_status=%s tenant=%s policy=%s → shadow",
                resp.status_code, tenant_id, policy_id,
            )
    except Exception as exc:  # connectors unreachable / timeout → fail-safe shadow
        logger.warning(
            "policy.mode_client.lookup_failed tenant=%s policy=%s: %s → shadow",
            tenant_id, policy_id, exc,
        )
        mode = DEFAULT_ENFORCEMENT_MODE

    _cache[key] = (mode, now + _CACHE_TTL_S)
    return mode


def invalidate(tenant_id: Optional[str] = None, policy_id: Optional[str] = None) -> None:
    """Drop cached entries (all, or for one tenant/policy). Used by tests + ops."""
    if tenant_id is None and policy_id is None:
        _cache.clear()
        return
    for key in [k for k in _cache if (tenant_id in (None, k[0]) and policy_id in (None, k[1]))]:
        _cache.pop(key, None)
