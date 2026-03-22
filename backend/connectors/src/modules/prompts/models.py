from sqlalchemy import Column, String, Text, Integer, TIMESTAMP, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
import uuid
from src.db.base import Base


class SavedPrompt(Base):
    __tablename__ = "saved_prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    variant = Column(String(20), nullable=False)  # strict | balanced | adaptive
    prompt_text = Column(Text, nullable=False)
    config_json = Column(JSONB)
    industry = Column(String(100))
    region = Column(String(20))
    strictness = Column(Integer, default=3)
    keywords = Column(Text)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, index=True)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)
