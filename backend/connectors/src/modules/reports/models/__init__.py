from sqlalchemy import Column, String, Text, Integer, BigInteger, TIMESTAMP, Enum, CheckConstraint, Boolean, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
import uuid
import enum

from src.db.base import Base


class ReportStatus(str, enum.Enum):
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportType(str, enum.Enum):
    COMPLIANCE = "compliance"
    RISK = "risk"
    BIAS = "bias"
    MODEL_EVAL = "model_eval"
    TRUST_EVALUATION = "trust_evaluation"


class ActionType(str, enum.Enum):
    CREATE_REPORT = "create_report"
    DELETE_REPORT = "delete_report"
    LOGIN = "login"
    LOGOUT = "logout"
    CREATE_API_KEY = "create_api_key"
    REVOKE_API_KEY = "revoke_api_key"
    TRUST_EVALUATION = "trust_evaluation"


class TrustReport(Base):
    __tablename__ = "trust_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    report_name = Column(String(100), index=True)        # e.g. "Cobalt Nexus"
    vx_report_id = Column(String(30), index=True)        # e.g. "VX-20260310-A1B2"
    title = Column(String(255))
    description = Column(Text)
    report_type = Column(String(50), nullable=False, index=True)
    status = Column(String(20), default="generating", index=True)
    input_payload = Column(JSONB)
    output_summary = Column(Text)
    output_full_report = Column(JSONB)
    storage_path = Column(Text)
    checksum_hash = Column(Text)
    version = Column(Integer, default=1)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(TIMESTAMP, index=True)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, index=True)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditTrail(Base):
    __tablename__ = "audit_trails"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), index=True)
    action_type = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(100), index=True)
    entity_id = Column(UUID(as_uuid=True), index=True)
    action_metadata = Column(JSONB)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, index=True)
    # Intelligence layer fields (migration 006)
    log_type = Column(String(50), nullable=False, server_default="EVALUATION", index=True)
    request_id = Column(String(100), index=True)
    related_request_id = Column(String(100), index=True)
    actor = Column(String(255))
    # Tamper-evident hash chain (Part A). prev_hash links to the previous record
    # in this tenant's chain; record_hash commits to the row's identity + prev_hash;
    # chain_seq is the per-tenant monotonic position (deterministic verification
    # order, independent of created_at ties). Nullable for pre-migration rows
    # until the startup backfill populates them.
    prev_hash = Column(String(80))
    record_hash = Column(String(80), index=True)
    chain_seq = Column(BigInteger)


class AuditLogLabel(Base):
    """Per-pillar ground truth labels for accuracy metric computation."""

    __tablename__ = "audit_log_labels"

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id           = Column(String(100), nullable=False, index=True)
    pillar_name          = Column(String(50), nullable=False, index=True)
    predicted_label      = Column(Boolean, nullable=False)
    predicted_confidence = Column(Float, nullable=False)
    ground_truth_label   = Column(Boolean, nullable=True)
    label_source         = Column(String(50), nullable=True)
    labeled_at           = Column(TIMESTAMP, nullable=True)
    pillar_latency_ms    = Column(Integer, nullable=True)
    user_id              = Column(UUID(as_uuid=True), nullable=True, index=True)
    created_at           = Column(TIMESTAMP, default=datetime.utcnow, index=True)


class DeletionLog(Base):
    __tablename__ = "deletion_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), index=True)
    user_id = Column(UUID(as_uuid=True), index=True)
    deletion_type = Column(String(20), CheckConstraint("deletion_type IN ('soft', 'hard')"))
    reason = Column(Text)
    deletion_metadata = Column(JSONB)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, index=True)
