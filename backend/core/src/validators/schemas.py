"""Request and response schemas for AI Safety API."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, validator


class TrustEvaluationRequest(BaseModel):
    """Request schema for AI output safety evaluation."""
    
    prompt: str = Field(..., min_length=1, description="User prompt or input to AI model")
    response: str = Field(..., min_length=1, description="AI-generated response to evaluate")
    model: str = Field(..., min_length=1, description="AI model identifier (e.g., 'gpt-4', 'claude-3')")
    provider: Optional[str] = Field(None, description="AI provider (e.g., 'openai', 'anthropic')")
    context: Dict[str, Any] = Field(default_factory=dict, description="Optional contextual information")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Optional evaluation metadata")
    
    @validator('prompt', 'response', 'model')
    def validate_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class ErrorDetail(BaseModel):
    """Error detail structure."""
    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    """Standard error response."""
    success: bool = False
    error: Dict[str, Any]


class TrustReportResponse(BaseModel):
    """Trust evaluation report response."""
    request_id: str
    entity_id: str
    final_score: Dict[str, Any]
    pillar_results: Dict[str, Any]
    timestamp: datetime
    execution_time_ms: Optional[float]


class SuccessResponse(BaseModel):
    """Standard success response wrapper."""
    success: bool = True
    data: TrustReportResponse
    metadata: Dict[str, Any]
