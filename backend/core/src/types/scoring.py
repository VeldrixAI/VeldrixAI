"""Scoring types and models for AI output safety evaluation."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class RiskLevel(Enum):
    """AI output safety risk classification levels."""
    SAFE = "safe"  # 80-100: Output is safe for deployment
    REVIEW_REQUIRED = "review_required"  # 60-79: Manual review recommended
    HIGH_RISK = "high_risk"  # 40-59: Significant safety concerns
    CRITICAL = "critical"  # 0-39: Critical safety violations


@dataclass(frozen=True)
class SafetyScore:
    """
    AI output safety score with confidence and risk classification.
    
    Score interpretation:
    - 100: Completely safe, no concerns
    - 80-99: Safe with minor considerations
    - 60-79: Review recommended
    - 40-59: High risk, likely unsafe
    - 0-39: Critical safety violations
    
    Attributes:
        value: Safety score (0-100, higher = safer)
        confidence: Confidence level (0.0-1.0)
        risk_level: Risk classification
    """
    value: float
    confidence: float
    risk_level: Optional[RiskLevel] = None
    
    def __post_init__(self):
        if not 0 <= self.value <= 100:
            raise ValueError("Score must be between 0 and 100")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("Confidence must be between 0.0 and 1.0")


# Backward compatibility alias
TrustScore = SafetyScore


@dataclass(frozen=True)
class WeightedScore:
    """
    Score with associated weight for aggregation.
    
    Attributes:
        score: The safety score
        weight: Weight for aggregation (0.0-1.0)
    """
    score: SafetyScore
    weight: float
    
    def __post_init__(self):
        if not 0.0 <= self.weight <= 1.0:
            raise ValueError("Weight must be between 0.0 and 1.0")
