"""Execution manager for parallel pillar processing."""

import asyncio
import logging
from typing import Dict, List

from src.pillars.pillar_engine import PillarEngine
from src.pillars.types import PillarResult, PillarStatus, PillarError
from src.domain.types import TrustEvaluationInput, TrustEvaluationContext
from src.types.scoring import TrustScore, RiskLevel


logger = logging.getLogger(__name__)


class ExecutionManager:
    """
    Manages parallel execution of pillar engines with timeout and error handling.
    
    Ensures resilient execution where individual pillar failures do not crash
    the entire evaluation process.
    
    LATENCY TARGET: 350ms wall-clock for all 5 pillars in parallel.
    """

    def __init__(self, timeout_seconds: float = 10.0):
        """
        Initialize execution manager.

        Args:
            timeout_seconds: Hard ceiling per pillar in seconds.
                             10s covers: speculative race (2s) + sequential NIM (4s)
                             + sequential Groq (3s) + margin.  Real inference completes
                             well within this; the ceiling catches stalled coroutines.
        """
        self.timeout_seconds = timeout_seconds
    
    async def execute_all(
        self,
        pillars: List[PillarEngine],
        input_data: TrustEvaluationInput,
        context: TrustEvaluationContext
    ) -> Dict[str, PillarResult]:
        """
        Execute all pillars in parallel with timeout protection.
        
        Args:
            pillars: List of pillar engines to execute
            input_data: Evaluation input
            context: Execution context
            
        Returns:
            Dictionary mapping pillar_id to PillarResult
        """
        if not pillars:
            logger.warning("No pillars to execute")
            return {}
        
        # Create execution tasks for all pillars
        tasks = [
            self._execute_pillar_safe(pillar, input_data, context)
            for pillar in pillars
        ]
        
        # Execute all pillars concurrently
        results = await asyncio.gather(*tasks, return_exceptions=False)
        
        # Map results by pillar ID
        return {result.metadata.id: result for result in results}
    
    async def _execute_pillar_safe(
        self,
        pillar: PillarEngine,
        input_data: TrustEvaluationInput,
        context: TrustEvaluationContext
    ) -> PillarResult:
        """
        Execute single pillar with timeout and error handling.
        
        Args:
            pillar: Pillar engine to execute
            input_data: Evaluation input
            context: Execution context
            
        Returns:
            PillarResult (always returns, never raises)
        """
        start_time = asyncio.get_event_loop().time()
        pillar_id = pillar.metadata.id
        
        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                pillar.evaluate(input_data, context),
                timeout=self.timeout_seconds
            )
            
            execution_time = (asyncio.get_event_loop().time() - start_time) * 1000
            
            # Validate result
            if result.score and not self._is_valid_score(result.score):
                logger.error(f"Pillar {pillar_id} returned invalid score")
                return self._create_error_result(
                    pillar,
                    "INVALID_SCORE",
                    "Pillar returned invalid score values",
                    execution_time
                )
            
            return result
            
        except asyncio.TimeoutError:
            execution_time = (asyncio.get_event_loop().time() - start_time) * 1000
            logger.warning(f"Pillar {pillar_id} timed out after {self.timeout_seconds}s")
            return self._create_error_result(
                pillar,
                "TIMEOUT",
                f"Execution exceeded {self.timeout_seconds}s timeout",
                execution_time
            )
            
        except Exception as e:
            execution_time = (asyncio.get_event_loop().time() - start_time) * 1000
            logger.error(f"Pillar {pillar_id} failed with error: {str(e)}")
            return self._create_error_result(
                pillar,
                "EXECUTION_ERROR",
                f"Unexpected error: {str(e)}",
                execution_time
            )
    
    def _is_valid_score(self, score: TrustScore) -> bool:
        """Validate score values are within acceptable ranges."""
        return (
            0 <= score.value <= 100 and
            0.0 <= score.confidence <= 1.0
        )
    
    def _create_error_result(
        self,
        pillar: PillarEngine,
        error_code: str,
        error_message: str,
        execution_time: float
    ) -> PillarResult:
        """Return a degraded PillarResult — score=50, PARTIAL, never null score."""
        return PillarResult(
            metadata=pillar.metadata,
            status=PillarStatus.PARTIAL,
            score=TrustScore(value=50.0, confidence=0.3, risk_level=RiskLevel.REVIEW_REQUIRED),
            execution_time_ms=execution_time,
            flags=[f"pillar_{error_code.lower()}"],
            error=PillarError(code=error_code, message=error_message),
        )
