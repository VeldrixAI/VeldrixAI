"""Policy rollout storage models (Part B / B.3).

``PolicyActiveBinding`` is the per-tenant enforcement-mode store the rollout tooling
reads/writes and that core's ``mode_client`` consults at request time. Registering
this model means ``Base.metadata.create_all()`` materializes the table (with its
CHECK constraint + DEFAULT 'shadow') on boot — the connectors "apply" mechanism, per
the Part A pattern. The canonical reviewable form is migrations/011_*.sql.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, Column, Integer, String, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

from src.db.base import Base


class PolicyActiveBinding(Base):
    __tablename__ = "policy_active_bindings"

    tenant_id = Column(UUID(as_uuid=True), primary_key=True)
    policy_id = Column(String(128), primary_key=True)
    pinned_version = Column(Integer, nullable=True)
    # Default-safe: a fresh binding is 'shadow'; the CHECK bounds the valid modes.
    policy_enforcement_mode = Column(
        String(32), nullable=False, server_default="shadow", default="shadow"
    )
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(
            "policy_enforcement_mode IN ('shadow','enforce','enforce_critical_only')",
            name="ck_policy_enforcement_mode",
        ),
    )
