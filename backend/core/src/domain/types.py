"""Core domain types for AI output safety evaluation."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from datetime import datetime


@dataclass
class AIOutputMetadata:
    """
    Metadata for AI output evaluation.
    
    Attributes:
        user_id: Optional user identifier
        request_id: Optional request identifier
        timestamp: Evaluation timestamp
        additional: Additional metadata fields
    """
    user_id: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: Optional[str] = None
    additional: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TrustEvaluationInput:
    """
    Input data for AI output safety evaluation.
    
    Attributes:
        prompt: User prompt or input to the AI model
        response: AI-generated response to evaluate
        model: AI model identifier (e.g., 'gpt-4', 'claude-3')
        provider: Optional AI provider (e.g., 'openai', 'anthropic')
        context: Optional contextual information
        metadata: Optional evaluation metadata
        entity_id: Unique identifier for this evaluation (auto-generated if not provided)
        timestamp: Evaluation request timestamp
    """
    prompt: str
    response: str
    model: str
    provider: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Optional[AIOutputMetadata] = None
    entity_id: str = field(default_factory=lambda: f"eval-{datetime.utcnow().timestamp()}")
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TrustEvaluationContext:
    """
    Execution context for trust evaluation.
    
    Attributes:
        request_id: Unique request identifier for tracing
        metadata: Additional context metadata
        config: Runtime configuration overrides
    """
    request_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SafetyReport:
    """
    Complete AI output safety evaluation report.
    
    Attributes:
        request_id: Request identifier
        entity_id: Evaluated output identifier
        final_score: Aggregated safety score (0-100, higher = safer)
        pillar_results: Results from each safety pillar
        timestamp: Report generation timestamp
        execution_time_ms: Total execution time in milliseconds
    """
    request_id: str
    entity_id: str
    final_score: 'SafetyScore'  # Forward reference
    pillar_results: Dict[str, 'PillarResult']  # Forward reference
    timestamp: datetime = field(default_factory=datetime.utcnow)
    execution_time_ms: Optional[float] = None


# Backward compatibility alias
TrustReport = SafetyReport
