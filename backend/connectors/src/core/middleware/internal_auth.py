"""Shared fail-safe authorization for internal service-to-service endpoints.

All ``internal/*`` routes (audit-write, chain-health, enforcement-mode read/change,
preflight) are reachable only by trusted callers that present the shared
``INTERNAL_SERVICE_TOKEN`` in the ``X-Internal-Token`` header.

Fail-safe: if no token is configured the endpoints are *disabled* (503) rather than
open — an unauthenticated caller can never inject audit rows, read cross-tenant
disclosure, or flip enforcement gating. This is the same dependency that already
guarded the mode-mutation routes; it is now applied uniformly (F-UNAUTH-1).
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException


def require_internal_token(x_internal_token: Optional[str] = Header(default=None)) -> None:
    """Authorize an internal service call with the shared internal service token.

    Fail-safe: if ``INTERNAL_SERVICE_TOKEN`` is unset/empty the route is *disabled*
    (503), never open; a missing/wrong token on a configured server is 401.
    """
    expected = os.getenv("INTERNAL_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="internal endpoint disabled: INTERNAL_SERVICE_TOKEN not configured",
        )
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="invalid or missing internal service token")
