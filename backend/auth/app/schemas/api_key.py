from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Optional


class ApiKeyCreate(BaseModel):
    name: Optional[str] = None


class ApiKeyResponse(BaseModel):
    id: UUID
    name: Optional[str]
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class ApiKeyCreated(BaseModel):
    """Response when API key is first created - includes raw key"""
    id: UUID
    name: Optional[str]
    api_key: str
    created_at: datetime
    
    class Config:
        from_attributes = True
