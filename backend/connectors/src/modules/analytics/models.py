from sqlalchemy import Column, String, Float, Integer, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from src.db.base import Base


class RequestLatency(Base):
    __tablename__ = "request_latency"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), index=True)
    endpoint = Column(String(100), nullable=False)
    latency_ms = Column(Float, nullable=False)
    status_code = Column(Integer, nullable=False, default=200)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, index=True)
