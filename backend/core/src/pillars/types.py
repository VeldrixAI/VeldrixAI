"""Pillar-specific types and result models for AI safety evaluation."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class PillarStatus(Enum):
    """Execution status of a pillar."""
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class PillarMetadata:
    """
    Metadata identifying a pillar implementation.
    
    Attributes:
        id: Unique pillar identifier
        name: Human-readable pillar name
        version: Semantic version string
        weight: Default scoring weight (0.0-1.0)
    """
    id: str
    name: str
    version: str
    weight: float
    
    def __post_init__(self):
        if not 0.0 <= self.weight <= 1.0:
            raise ValueError("Weight must be between 0.0 and 1.0")


@dataclass
class PillarError:
    """
    Error information for pillar execution failures.
    
    Attributes:
        code: Error code
        message: Human-readable error message
        details: Additional error context
    """
    code: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PillarResult:
    """
    Result from a single AI safety pillar evaluation.
    
    Attributes:
        metadata: Pillar identification metadata
        status: Execution status
        score: Safety score (None if failed, 0-100 where higher = safer)
        execution_time_ms: Execution duration in milliseconds
        flags: List of detected safety issues or violations
        error: Error information if status is FAILED or PARTIAL
        details: Additional result details and evidence
    """
    metadata: PillarMetadata
    status: PillarStatus
    score: Optional['SafetyScore']  # Forward reference
    execution_time_ms: float
    flags: List[str] = field(default_factory=list)
    error: Optional[PillarError] = None
    details: Dict[str, Any] = field(default_factory=dict)
