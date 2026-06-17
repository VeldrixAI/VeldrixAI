"""Internal enforcement-mode rollout endpoints (Part B / B.3).

Surface for the rollout tooling: read the current mode, change it (audited), roll
back to shadow (audited), and compute the pre-flight blast-radius report. Mutations
are authorized with a shared internal service token (``INTERNAL_SERVICE_TOKEN``) and
each writes its own tamper-evident audit record. The GET read is unauthenticated
service-to-service (it only reveals the mode) and is what core's ``mode_client`` calls.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.db.base import get_db
from src.modules.policy import mode_service
from src.modules.policy.mode_service import ModeChangeError

router = APIRouter(prefix="/api/policy/internal", tags=["policy-rollout"])


def require_internal_token(x_internal_token: Optional[str] = Header(default=None)) -> None:
    """Authorize a mode-changing operation with the shared internal service token.

    Fail-safe: if no token is configured, mode changes are *disabled* (503) rather
    than open — enforcement gating can never be flipped by an unauthenticated caller.
    """
    expected = os.getenv("INTERNAL_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="enforcement-mode changes are disabled: INTERNAL_SERVICE_TOKEN not configured",
        )
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="invalid or missing internal service token")


class ModeChangeRequest(BaseModel):
    tenant_id: str
    policy_id: str
    mode: str
    actor: str
    reason: Optional[str] = None


class RollbackRequest(BaseModel):
    tenant_id: str
    policy_id: str
    actor: str
    reason: Optional[str] = None


@router.get("/enforcement-mode", include_in_schema=False)
def read_mode(
    tenant_id: str = Query(...),
    policy_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return the tenant's current enforcement mode (default shadow). Read by core."""
    return {
        "tenant_id": tenant_id,
        "policy_id": policy_id,
        "mode": mode_service.get_mode(db, tenant_id, policy_id),
    }


@router.post("/enforcement-mode", include_in_schema=False)
def change_mode(
    body: ModeChangeRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    """Change a tenant's enforcement mode (audited, default-safe, validated)."""
    try:
        return mode_service.change_mode(
            db,
            tenant_id=body.tenant_id,
            policy_id=body.policy_id,
            new_mode=body.mode,
            actor=body.actor,
            reason=body.reason,
        )
    except ModeChangeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/enforcement-mode/rollback", include_in_schema=False)
def rollback(
    body: RollbackRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    """Immediately de-gate a tenant to shadow (audited)."""
    return mode_service.rollback_to_shadow(
        db,
        tenant_id=body.tenant_id,
        policy_id=body.policy_id,
        actor=body.actor,
        reason=body.reason,
    )


@router.get("/preflight-report", include_in_schema=False)
def preflight(
    tenant_id: str = Query(...),
    policy_id: Optional[str] = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """Blast-radius the customer sees before flipping shadow→enforce."""
    return mode_service.preflight_report(db, tenant_id=tenant_id, policy_id=policy_id, days=days)
