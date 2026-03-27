"""
Dependency injectors for the /api/v1 routes.
Provides a singleton VeldrixSDK instance and API-key authentication
that validates against the auth service database.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Header, HTTPException
import httpx

from src.config import get_settings
from src.sdk.client import VeldrixSDK

logger = logging.getLogger("veldrix.api")

# Singleton SDK instance — created once per process
_sdk: VeldrixSDK | None = None

# Auth service URL (auth runs on port 8000)
AUTH_SERVICE_URL = "http://localhost:8000"


async def get_sdk() -> VeldrixSDK:
    """Return the process-level VeldrixSDK singleton."""
    global _sdk
    if _sdk is None:
        _sdk = VeldrixSDK()
        logger.info("VeldrixSDK singleton initialised (version=%s)", VeldrixSDK.VERSION)
    return _sdk


async def require_api_key(
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-Veldrix-Key"),
) -> dict:
    """
    Validate API key and return user info.

    Accepts either:
      - Authorization: Bearer vx-live-...  (SDK sends this)
      - X-Veldrix-Key: vx-live-...         (legacy / direct calls)

    Validates against the auth service DB via internal endpoint.
    Returns {"user_id": "...", "email": "..."} for downstream use.
    """
    # Extract the raw key from whichever header was provided
    raw_key = None
    if authorization and authorization.startswith("Bearer "):
        raw_key = authorization[7:].strip()
    if not raw_key and x_api_key:
        raw_key = x_api_key

    settings = get_settings()

    if not raw_key:
        if not settings.VELDRIX_INTERNAL_API_KEY:
            logger.warning("No API key provided and VELDRIX_INTERNAL_API_KEY not set; dev mode bypass")
            return {"user_id": None, "email": None}
        raise HTTPException(status_code=401, detail="Missing API key")

    # Internal key check BEFORE format validation
    if raw_key == settings.VELDRIX_INTERNAL_API_KEY:
        return {"user_id": None, "email": None}

    if not raw_key.startswith("vx-"):
        raise HTTPException(status_code=401, detail="Invalid API key format")

    # Validate against auth service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{AUTH_SERVICE_URL}/internal/validate-api-key",
                json={"api_key": raw_key},
            )
        if resp.status_code == 200:
            data = resp.json()
            return {"user_id": data.get("user_id"), "email": data.get("email")}
        else:
            raise HTTPException(status_code=401, detail="Invalid API key")
    except httpx.HTTPError as e:
        if settings.VELDRIX_INTERNAL_API_KEY and raw_key == settings.VELDRIX_INTERNAL_API_KEY:
            return {"user_id": None, "email": None}
        logger.error("Auth service unreachable: %s", e)
        raise HTTPException(status_code=503, detail="Auth service unavailable")
