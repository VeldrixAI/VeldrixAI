from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from src.modules.reports.models import ReportType, ReportStatus


class GenerateReportRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    report_type: ReportType
    input_payload: Optional[Dict[str, Any]] = None

    class Config:
        use_enum_values = True


class ReportResponse(BaseModel):
    id: UUID
    user_id: UUID
    report_name: Optional[str] = None
    vx_report_id: Optional[str] = None
    title: Optional[str]
    description: Optional[str]
    report_type: ReportType
    status: ReportStatus
    storage_path: Optional[str]
    checksum_hash: Optional[str]
    output_full_report: Optional[dict] = None
    overall_score: Optional[float] = None
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_score(cls, report) -> "ReportResponse":
        obj = cls.model_validate(report)
        if report.output_full_report and isinstance(report.output_full_report, dict):
            obj.overall_score = report.output_full_report.get("overall_score")
        return obj


class SignedUrlResponse(BaseModel):
    report_id: str
    signed_url: str
    expires_in: int = 3600
