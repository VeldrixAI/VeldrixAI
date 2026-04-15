import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Enum, ForeignKey, Integer, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class UserRole(str, enum.Enum):
    USER = "user"
    DEVELOPER = "developer"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Billing fields
    stripe_customer_id = Column(String, nullable=True, unique=True, index=True)
    subscription_id = Column(String, nullable=True, unique=True, index=True)
    plan_tier = Column(String, default="free", nullable=False)
    plan_status = Column(String, default="active", nullable=False)
    eval_count_month = Column(Integer, default=0, nullable=False)
    billing_period_end = Column(DateTime, nullable=True)

    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    key_hash = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="api_keys")


# ── Notification severity enum ────────────────────────────────────────────────

class NotificationSeverity(str, enum.Enum):
    BLOCKED   = "blocked"
    FLAGGED   = "flagged"
    MASKED    = "masked"
    ESCALATED = "escalated"


# ── Notification model ────────────────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    audit_log_id = Column(String(64), nullable=True)   # external reference — no FK to connectors DB

    severity    = Column(Enum(NotificationSeverity), nullable=False)
    pillar      = Column(String(64), nullable=False)   # e.g. "safety", "pii", "hallucination"
    enforcement = Column(String(64), nullable=False)   # e.g. "blocked", "masked", "escalated"
    title       = Column(String(200), nullable=False)
    message     = Column(Text, nullable=False)
    endpoint    = Column(String(500), nullable=True)
    model_name  = Column(String(200), nullable=True)
    agent_name  = Column(String(200), nullable=True)
    tool_name   = Column(String(200), nullable=True)

    is_read    = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_notifications_user_unread",   "user_id", "is_read"),
        Index("ix_notifications_user_created",  "user_id", "created_at"),
    )
