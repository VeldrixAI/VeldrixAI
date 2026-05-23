from uuid import uuid4
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from src.db.base import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    ticket_id  = Column(String(64),  unique=True,  nullable=False, index=True)
    user_id    = Column(UUID(as_uuid=True), nullable=True)
    user_email = Column(String(255), nullable=False, index=True)
    subject    = Column(String(512), nullable=False)
    category   = Column(String(64),  nullable=False, default="general")
    priority   = Column(String(16),  nullable=False, default="medium")
    description = Column(Text,       nullable=False)
    status     = Column(String(16),  nullable=False, default="open")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
