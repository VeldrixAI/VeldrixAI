"""Audit trails controller — paginated, filtered, per-user."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any
from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from src.modules.reports.models import AuditTrail
from src.utils.timezone import build_audit_timestamps
from uuid import UUID
import io, csv

router = APIRouter(prefix="/api/audit-trails", tags=["audit-trails"])


class InternalAuditRequest(BaseModel):
    action_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    user_timezone: Optional[str] = "UTC"


@router.post("/internal/audit-trail", status_code=201, include_in_schema=False)
def internal_log_audit(body: InternalAuditRequest, db: Session = Depends(get_db)):
    """Internal service-to-service audit logging. Called from core service."""
    ts = build_audit_timestamps(body.user_timezone or "UTC")
    entry = AuditTrail(
        user_id=UUID(body.user_id) if body.user_id else None,
        action_type=body.action_type,
        entity_type=body.entity_type,
        entity_id=UUID(body.entity_id) if body.entity_id else None,
        action_metadata=body.metadata,
        logged_at_utc=ts["logged_at_utc"],
        user_timezone=ts["user_timezone"],
        logged_at_local=ts["logged_at_local"],
    )
    db.add(entry)
    db.commit()
    return {"ok": True}


class LogAuditRequest(BaseModel):
    action_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.post("/", status_code=201)
async def log_audit_entry(
    body: LogAuditRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = UUID(current_user["id"])
    user_tz = current_user.get("tz", "UTC") or "UTC"
    ts = build_audit_timestamps(user_tz)
    entry = AuditTrail(
        user_id=uid,
        action_type=body.action_type,
        entity_type=body.entity_type,
        entity_id=UUID(body.entity_id) if body.entity_id else None,
        action_metadata=body.metadata,
        logged_at_utc=ts["logged_at_utc"],
        user_timezone=ts["user_timezone"],
        logged_at_local=ts["logged_at_local"],
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": str(entry.id)}


@router.get("/")
async def list_audit_trails(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: str = Query(None),
    search: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    from sqlalchemy import or_
    q = db.query(AuditTrail).filter(
        or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None))
    )

    if action_type:
        q = q.filter(AuditTrail.action_type == action_type)
    if search:
        q = q.filter(AuditTrail.action_type.ilike(f"%{search}%"))

    total = q.count()
    records = q.order_by(AuditTrail.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "records": [
            {
                "id": str(r.id),
                "action_type": r.action_type,
                "entity_type": r.entity_type,
                "entity_id": str(r.entity_id) if r.entity_id else None,
                "metadata": r.action_metadata,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
                "request_id": (r.action_metadata or {}).get("request_id"),
                "logged_at_utc": r.logged_at_utc.isoformat() if r.logged_at_utc else None,
                "user_timezone": r.user_timezone,
                "logged_at_local": r.logged_at_local,
            }
            for r in records
        ],
    }


@router.get("/{record_id}")
async def get_audit_trail(
    record_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    uid = current_user["id"]
    record = db.query(AuditTrail).filter(AuditTrail.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.user_id is not None and str(record.user_id) != str(uid):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": str(record.id),
        "action_type": record.action_type,
        "entity_type": record.entity_type,
        "entity_id": str(record.entity_id) if record.entity_id else None,
        "metadata": record.action_metadata,
        "ip_address": record.ip_address,
        "created_at": record.created_at.isoformat() + "Z" if record.created_at else None,
        "request_id": (record.action_metadata or {}).get("request_id"),
        "logged_at_utc": record.logged_at_utc.isoformat() if record.logged_at_utc else None,
        "user_timezone": record.user_timezone,
        "logged_at_local": record.logged_at_local,
    }


@router.delete("/{record_id}", status_code=204)
async def delete_audit_trail(
    record_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    uid = current_user["id"]
    record = db.query(AuditTrail).filter(AuditTrail.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.user_id is not None and str(record.user_id) != str(uid):
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(record)
    db.commit()


@router.get("/export")
async def export_csv(
    action_type: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    from sqlalchemy import or_
    q = db.query(AuditTrail).filter(
        or_(AuditTrail.user_id == uid, AuditTrail.user_id.is_(None))
    )
    if action_type:
        q = q.filter(AuditTrail.action_type == action_type)
    records = q.order_by(AuditTrail.created_at.desc()).limit(1000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Action", "Entity Type", "Entity ID", "IP", "Timestamp (UTC)", "User Timezone", "Timestamp (Local)"])
    for r in records:
        writer.writerow([
            str(r.id), r.action_type, r.entity_type or "",
            str(r.entity_id) if r.entity_id else "",
            r.ip_address or "",
            r.logged_at_utc.isoformat() if r.logged_at_utc else (r.created_at.isoformat() if r.created_at else ""),
            r.user_timezone or "UTC",
            r.logged_at_local or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-trails.csv"},
    )
