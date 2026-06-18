"""Internal enforcement-mode rollout endpoints (Part B / B.3).

Surface for the rollout tooling: read the current mode, change it (audited), roll
back to shadow (audited), and compute the pre-flight blast-radius report. Every route
— including the GET reads (mode + preflight) — is authorized with the shared internal
service token (``INTERNAL_SERVICE_TOKEN``); the reads leak cross-tenant mode/blast
intelligence, so they are no longer unauthenticated (F-UNAUTH-1). Core's ``mode_client``
presents the token via the shared internal HTTP pool. Mutations additionally write
their own tamper-evident audit record.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.db.base import get_db
from src.core.middleware.internal_auth import require_internal_token
from src.modules.policy import mode_service
from src.modules.policy.mode_service import ModeChangeError

router = APIRouter(prefix="/api/policy/internal", tags=["policy-rollout"])

# Re-exported for callers/tests that import it from this module.
__all__ = ["router", "require_internal_token"]


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
    _: None = Depends(require_internal_token),
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
    _: None = Depends(require_internal_token),
):
    """Blast-radius the customer sees before flipping shadow→enforce."""
    return mode_service.preflight_report(db, tenant_id=tenant_id, policy_id=policy_id, days=days)
