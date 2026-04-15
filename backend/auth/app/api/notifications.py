"""Notification endpoints — user-scoped trust violation alerts."""

import math
import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Notification, NotificationSeverity
from app.db.session import get_db
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "user_id": str(n.user_id),
        "severity": n.severity.value,
        "pillar": n.pillar,
        "enforcement": n.enforcement,
        "title": n.title,
        "message": n.message,
        "endpoint": n.endpoint,
        "model_name": n.model_name,
        "agent_name": n.agent_name,
        "tool_name": n.tool_name,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat(),
        "audit_log_id": n.audit_log_id,
    }


# ── Public REST endpoints (require user JWT) ──────────────────────────────────

@router.get("/")
def list_notifications(
    page: int = 1,
    limit: int = 20,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Paginated notification list for the authenticated user."""
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    total = q.count()
    items = (
        q.order_by(Notification.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    unread_count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).count()
    return {
        "items": [_serialize(n) for n in items],
        "total": total,
        "unread_count": unread_count,
        "page": page,
        "pages": max(1, math.ceil(total / limit)),
    }


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lightweight unread count — REST fallback for non-WS clients."""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).count()
    return {"unread_count": count}


@router.patch("/mark-read")
def mark_read(
    notification_ids: Optional[List[UUID]] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Bulk mark as read. Pass notification_ids to mark specific items; omit to mark all."""
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if notification_ids:
        q = q.filter(Notification.id.in_(notification_ids))
    q.update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"success": True}


@router.patch("/{notification_id}/read")
def mark_one_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a single notification as read."""
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"success": True}


# ── Internal endpoint (core → auth, no user JWT) ──────────────────────────────

@router.post("/internal-create", include_in_schema=False)
def internal_create_notification(
    payload: dict,
    x_internal_api_key: str = Header(...),
    db: Session = Depends(get_db),
):
    """
    Service-to-service endpoint called by aegisai-core after enforcement resolves.
    Protected by VELDRIX_INTERNAL_API_KEY shared secret.
    """
    expected = os.environ.get("VELDRIX_INTERNAL_API_KEY", "")
    if not expected or x_internal_api_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    n = Notification(
        user_id=UUID(payload["user_id"]),
        audit_log_id=payload.get("audit_log_id"),
        severity=NotificationSeverity(payload["severity"]),
        pillar=payload["pillar"],
        enforcement=payload["enforcement"],
        title=payload["title"],
        message=payload["message"],
        endpoint=payload.get("endpoint"),
        model_name=payload.get("model_name"),
        agent_name=payload.get("agent_name"),
        tool_name=payload.get("tool_name"),
        is_read=False,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _serialize(n)
