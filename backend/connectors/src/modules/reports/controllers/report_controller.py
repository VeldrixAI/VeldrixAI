from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from src.modules.reports.schemas import GenerateReportRequest, ReportResponse, SignedUrlResponse
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
    from src.modules.reports.models import ReportType
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


@router.get("/{report_id}/download", response_model=SignedUrlResponse)
async def get_download_url(
    report_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    signed_url = ReportService(db).get_signed_url(report_id, user_id)
    return SignedUrlResponse(report_id=str(report_id), signed_url=signed_url, expires_in=3600)


@router.delete("/{report_id}")
async def delete_report(
    report_id: UUID,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    return ReportService(db).soft_delete_report(
        report_id=report_id,
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
