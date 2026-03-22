"""Score aggregation and confidence calculation for AI safety evaluation."""

import logging
from typing import Dict, Tuple
from dataclasses import dataclass

from src.pillars.types import PillarResult, PillarStatus
from src.types.scoring import SafetyScore, RiskLevel


logger = logging.getLogger(__name__)


@dataclass
class AggregationResult:
    """Result of AI safety score aggregation."""
    final_score: SafetyScore
    successful_pillars: int
    failed_pillars: int
    total_weight_used: float


class ScoreAggregator:
    """
    Aggregates AI safety pillar scores into final safety score.
    
    Applies weighted averaging, computes confidence based on pillar success rate,
    and assigns risk classification for AI output safety.
    """
    
    def __init__(self, min_pillars_required: int = 1):
        """
        Initialize score aggregator.
        
        Args:
            min_pillars_required: Minimum successful pillars needed for valid result
        """
        self.min_pillars_required = min_pillars_required
    
    def aggregate(self, pillar_results: Dict[str, PillarResult]) -> AggregationResult:
        """
        Aggregate pillar results into final trust score.
        
        Args:
            pillar_results: Dictionary of pillar results by pillar_id
            
        Returns:
            AggregationResult with final score and metadata
            
        Raises:
            ValueError: If insufficient successful pillars
        """
        if not pillar_results:
            raise ValueError("No pillar results to aggregate")
        
        # Separate successful and failed pillars
        successful = [
            r for r in pillar_results.values()
            if r.status == PillarStatus.SUCCESS and r.score is not None
        ]
        failed = [
            r for r in pillar_results.values()
            if r.status != PillarStatus.SUCCESS or r.score is None
        ]
        
        if len(successful) < self.min_pillars_required:
            raise ValueError(
                f"Insufficient successful pillars: {len(successful)} < {self.min_pillars_required}"
            )
        
        # Calculate weighted score
        weighted_score, total_weight = self._calculate_weighted_score(successful)
        
        # Calculate confidence based on success rate and weight coverage
        confidence = self._calculate_confidence(
            len(successful),
            len(pillar_results),
            total_weight
        )
        
        # Determine risk level
        risk_level = self._classify_risk(weighted_score, confidence)
        
        final_score = SafetyScore(
            value=round(weighted_score, 2),
            confidence=round(confidence, 3),
            risk_level=risk_level
        )
        
        logger.info(
            f"Aggregated score: {final_score.value} "
            f"(confidence: {final_score.confidence}, risk: {risk_level.value})"
        )
        
        return AggregationResult(
            final_score=final_score,
            successful_pillars=len(successful),
            failed_pillars=len(failed),
            total_weight_used=total_weight
        )
    
    def _calculate_weighted_score(
        self,
        successful_pillars: list[PillarResult]
    ) -> Tuple[float, float]:
        """
        Calculate weighted average score from successful pillars.
        
        Args:
            successful_pillars: List of successful pillar results
            
        Returns:
            Tuple of (weighted_score, total_weight_used)
        """
        total_weighted_score = 0.0
        total_weight = 0.0
        
        for result in successful_pillars:
            weight = result.metadata.weight
            score_value = result.score.value
            
            total_weighted_score += score_value * weight
            total_weight += weight
        
        # Normalize by actual weight used (handles partial failures)
        if total_weight > 0:
            weighted_score = total_weighted_score / total_weight
        else:
            weighted_score = 0.0
        
        return weighted_score, total_weight
    
    def _calculate_confidence(
        self,
        successful_count: int,
        total_count: int,
        weight_coverage: float
    ) -> float:
        """
        Calculate confidence score based on pillar success rate and weight coverage.
        
        Confidence formula:
        confidence = (success_rate * 0.7) + (weight_coverage * 0.3)
        
        Where:
        - success_rate = successful_pillars / total_pillars
        - weight_coverage = sum of successful pillar weights (assumes weights sum to 1.0)
        
        Args:
            successful_count: Number of successful pillars
            total_count: Total number of pillars
            weight_coverage: Sum of weights from successful pillars
            
        Returns:
            Confidence score between 0.0 and 1.0
        """
        success_rate = successful_count / total_count if total_count > 0 else 0.0
        
        # Weight coverage contribution (capped at 1.0)
        weight_factor = min(weight_coverage, 1.0)
        
        # Weighted combination: prioritize success rate
        confidence = (success_rate * 0.7) + (weight_factor * 0.3)
        
        return max(0.0, min(1.0, confidence))
    
    def _classify_risk(self, score: float, confidence: float) -> RiskLevel:
        """
        Classify AI output safety risk based on score and confidence.
        
        Risk classification matrix:
        - Score >= 80 and confidence >= 0.7 → SAFE
        - Score >= 60 and confidence >= 0.6 → REVIEW_REQUIRED
        - Score >= 40 → HIGH_RISK
        - Score < 40 → CRITICAL
        
        Low confidence downgrades risk level.
        
        Args:
            score: Safety score (0-100, higher = safer)
            confidence: Confidence level (0.0-1.0)
            
        Returns:
            RiskLevel enum
        """
        if score >= 80 and confidence >= 0.7:
            return RiskLevel.SAFE
        elif score >= 60 and confidence >= 0.6:
            return RiskLevel.REVIEW_REQUIRED
        elif score >= 40:
            return RiskLevel.HIGH_RISK
        else:
            return RiskLevel.CRITICAL
