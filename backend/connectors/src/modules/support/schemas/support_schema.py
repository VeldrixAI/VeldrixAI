from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional
import re

VALID_CATEGORIES = {
    "bug_report", "billing", "sdk_integration", "api_keys",
    "feature_request", "security", "general",
}
VALID_PRIORITIES = {"low", "medium", "high", "critical"}


class SubmitTicketRequest(BaseModel):
    user_email:  str = Field(..., min_length=5,  max_length=255)
    subject:     str = Field(..., min_length=5,  max_length=256)
    description: str = Field(..., min_length=20, max_length=5000)
    category:    str = Field(default="general")
    priority:    str = Field(default="medium")

    @field_validator("user_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            return "general"
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        if v not in VALID_PRIORITIES:
            return "medium"
        return v


class TicketResponse(BaseModel):
    id:          str
    ticket_id:   str
    user_email:  str
    subject:     str
    category:    str
    priority:    str
    description: str
    status:      str
    created_at:  datetime

    model_config = {"from_attributes": True}
