from sqlalchemy.orm import Session
from src.modules.reports.models import TrustReport, ReportStatus, ReportType, ActionType
from src.modules.reports.schemas import GenerateReportRequest
from src.modules.reports.services.pdf_service import PDFService
from src.modules.reports.services.storage_service import compute_checksum
from src.modules.reports.services.audit_service import AuditService
from src.modules.reports.services.report_namer import generate_report_name, generate_vx_report_id
from datetime import datetime
from typing import Optional
from uuid import UUID
from fastapi import HTTPException


class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.pdf_service = PDFService()
        self.audit_service = AuditService()

    def _unique_report_name(self) -> str:
        existing = [
            r.report_name for r in
            self.db.query(TrustReport.report_name)
                   .filter(TrustReport.report_name.isnot(None))
                   .all()
        ]
        return generate_report_name(existing_names=existing)

    def generate_report(
        self,
        user_id: UUID,
        request: GenerateReportRequest,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> TrustReport:
        try:
            report_type_value = request.report_type
            if isinstance(report_type_value, ReportType):
                report_type_value = report_type_value.value
            elif isinstance(report_type_value, str):
                report_type_value = report_type_value.lower()

            report_name  = self._unique_report_name()
            vx_report_id = generate_vx_report_id()

            # Determine status from evaluation result — HIGH_RISK → failed
            eval_result = (request.input_payload or {}).get("result", {})
            risk_level = (eval_result.get("final_score") or {}).get("risk_level", "")
            enforcement = (eval_result.get("final_score") or {}).get("enforcement_action", "")
            overall_score = (eval_result.get("final_score") or {}).get("value", None)
            is_high_risk = (
                str(risk_level).upper() in ("HIGH_RISK", "HIGH", "CRITICAL")
                or str(enforcement).upper() in ("BLOCK", "BLOCKED")
            )

            # Build a human-readable executive summary from real scores
            score_str = f"{float(overall_score):.1f}/100" if overall_score is not None else "N/A"
            risk_label = str(risk_level).replace("_", " ").title() if risk_level else "Unknown"
            pillar_results = eval_result.get("pillar_results") or {}
            pillar_lines = ", ".join(
                f"{p.get('metadata', {}).get('name', pid)}: {(p.get('score') or {}).get('value', 0):.1f}"
                for pid, p in pillar_results.items()
                if p.get("score")
            )
            outcome_label = "HIGH_RISK — Blocked" if is_high_risk else "Passed"
            executive_summary = (
                f"This evaluation produced an overall trust score of {score_str} "
                f"with a risk classification of {risk_label}. "
                f"Outcome: {outcome_label}. "
                + (f"Pillar scores — {pillar_lines}. " if pillar_lines else "")
                + "All scores were computed deterministically using the VeldrixAI "
                "five-pillar governance framework."
            )
            report = TrustReport(
                user_id=user_id,
                report_name=report_name,
                vx_report_id=vx_report_id,
                title=request.title,
                description=request.description,
                report_type=report_type_value,
                status="generating",
                input_payload=request.input_payload,
                output_summary=executive_summary,
                version=1,
            )
            self.db.add(report)
            self.db.commit()
            self.db.refresh(report)

            pdf_content = self.pdf_service.generate_report_pdf(
                title=report.title or f"{report_type_value.replace('_', ' ').title()} Report",
                report_type=report_type_value,
                input_payload=report.input_payload or {},
                output_summary=report.output_summary,
                created_at=report.created_at,
                report_name=report_name,
                vx_report_id=vx_report_id,
            )

            checksum = compute_checksum(pdf_content)

            report.checksum_hash = checksum
            report.status = "failed" if is_high_risk else "completed"
            report.output_full_report = {
                "report_id":       str(report.id),
                "report_name":     report_name,
                "vx_report_id":    vx_report_id,
                "generated_at":    report.created_at.isoformat(),
                "file_size_bytes": len(pdf_content),
                "checksum":        checksum,
                "overall_score":   overall_score,
            }
            self.db.commit()
            self.db.refresh(report)

            self.audit_service.log_action(
                db=self.db,
                user_id=user_id,
                action_type="create_report",
                entity_type="TrustReport",
                entity_id=report.id,
                metadata={
                    "report_type":  report.report_type,
                    "report_name":  report_name,
                    "vx_report_id": vx_report_id,
                    "title":        report.title,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )

            return report, pdf_content

        except Exception as e:
            if "report" in locals():
                report.status = "failed"
                self.db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"Report generation failed: {str(e)}",
            )

    def get_report(self, report_id: UUID, user_id: UUID) -> Optional[TrustReport]:
        report = self.db.query(TrustReport).filter(
            TrustReport.id == report_id,
            TrustReport.user_id == user_id,
            TrustReport.is_deleted == False,
            TrustReport.deleted_at.is_(None),
        ).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return report

    def regenerate_pdf(self, report_id: UUID, user_id: UUID) -> tuple:
        """Re-generate PDF bytes on demand from stored report data."""
        report = self.get_report(report_id, user_id)
        report_type_value = report.report_type
        if hasattr(report_type_value, 'value'):
            report_type_value = report_type_value.value
        pdf_bytes = self.pdf_service.generate_report_pdf(
            title=report.title or f"{str(report_type_value).replace('_', ' ').title()} Report",
            report_type=str(report_type_value),
            input_payload=report.input_payload or {},
            output_summary=report.output_summary,
            created_at=report.created_at,
            report_name=report.report_name,
            vx_report_id=report.vx_report_id,
        )
        return report, pdf_bytes

    def soft_delete_report(
        self,
        report_id: UUID,
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        try:
            report = self.db.query(TrustReport).filter(
                TrustReport.id == report_id,
                TrustReport.user_id == user_id,
            ).first()
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")

            if report.is_deleted or report.deleted_at is not None:
                return {"success": True, "message": "Report deleted", "report_id": str(report_id)}

            report.is_deleted = True
            report.deleted_at = datetime.utcnow()

            self.audit_service.log_action(
                db=self.db,
                user_id=user_id,
                action_type="delete_report",
                entity_type="TrustReport",
                entity_id=report_id,
                metadata={
                    "report_type": report.report_type,
                    "title":       report.title,
                    "deleted_at":  report.deleted_at.isoformat(),
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            self.db.commit()
            return {"success": True, "message": "Report deleted", "report_id": str(report_id)}

        except HTTPException:
            raise
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to delete report: {str(e)}")
