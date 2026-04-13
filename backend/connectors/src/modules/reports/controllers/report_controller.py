from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from src.modules.reports.schemas import GenerateReportRequest, ReportResponse
from src.modules.reports.services.report_service import ReportService
from src.core.middleware.auth import get_current_user
from src.db.base import get_db
from uuid import UUID
import io

router = APIRouter(prefix="/api/reports", tags=["reports"])


class OnDemandPDFRequest(BaseModel):
    title: Optional[str] = None
    report_type: str = "trust_evaluation"
    input_payload: Optional[Dict[str, Any]] = None


@router.post("/generate-pdf")
async def generate_pdf_on_demand(
    body: OnDemandPDFRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate PDF, save to DB + S3 (appears in Reports page),
    and stream the bytes back to the browser immediately.
    """
    from src.modules.reports.schemas import GenerateReportRequest
    from src.modules.reports.models import ReportType, AuditTrail
    user_id = UUID(current_user["id"])
    req = GenerateReportRequest(
        title=body.title or f"Trust Evaluation — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        report_type=ReportType.TRUST_EVALUATION,
        input_payload=body.input_payload or {},
    )
    report, pdf_bytes = ReportService(db).generate_report(
        user_id=user_id,
        request=req,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    # Emit REPORT_CREATED audit log
    source_request_id = (body.input_payload or {}).get("request_id")
    audit_entry = AuditTrail(
        user_id=user_id,
        action_type="create_report",
        entity_type="trust_report",
        entity_id=report.id,
        action_metadata={
            "report_id": str(report.id),
            "vx_report_id": report.vx_report_id,
            "format": "pdf",
            "source_request_id": source_request_id,
        },
        log_type="REPORT_CREATED",
        related_request_id=source_request_id,
        actor=current_user.get("email") or str(user_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(audit_entry)
    db.commit()

    filename = f"veldrix-{report.vx_report_id or report.id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/generate", response_model=ReportResponse, status_code=201)
async def generate_report(
    request_data: GenerateReportRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    report, _ = ReportService(db).generate_report(
        user_id=user_id,
        request=request_data,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return report


@router.get("/", response_model=list[ReportResponse])
async def list_reports(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    from src.modules.reports.models import TrustReport
    user_id = UUID(current_user["id"])
    reports = (
        db.query(TrustReport)
        .filter(
            TrustReport.user_id == user_id,
            TrustReport.is_deleted == False,
            TrustReport.deleted_at.is_(None),
        )
        .order_by(TrustReport.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [ReportResponse.from_orm_with_score(r) for r in reports]


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    return ReportService(db).get_report(report_id, user_id)


@router.get("/{report_id}/download")
async def download_report(
    report_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-generate PDF on demand and stream directly to the client."""
    user_id = UUID(current_user["id"])
    report, pdf_bytes = ReportService(db).regenerate_pdf(report_id, user_id)
    filename = f"veldrix-{report.vx_report_id or report_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.delete("/{report_id}")
async def delete_report(
    report_id: UUID,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from src.modules.reports.models import AuditTrail, TrustReport
    user_id = UUID(current_user["id"])

    # Capture source_request_id before deletion for the audit log
    report_row = (
        db.query(TrustReport)
        .filter(TrustReport.id == report_id, TrustReport.user_id == user_id)
        .first()
    )
    source_request_id = None
    if report_row and report_row.input_payload:
        source_request_id = (report_row.input_payload or {}).get("request_id")

    result = ReportService(db).soft_delete_report(
        report_id=report_id,
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    # Emit REPORT_DELETED audit log
    audit_entry = AuditTrail(
        user_id=user_id,
        action_type="delete_report",
        entity_type="trust_report",
        entity_id=report_id,
        action_metadata={
            "report_id": str(report_id),
            "deleted_at": datetime.utcnow().isoformat(),
            "source_request_id": source_request_id,
        },
        log_type="REPORT_DELETED",
        related_request_id=source_request_id,
        actor=current_user.get("email") or str(user_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(audit_entry)
    db.commit()

    return result
