"""Main orchestration engine for AI output safety evaluation."""

import logging
import time
from datetime import datetime

from src.domain.types import TrustEvaluationInput, TrustEvaluationContext, TrustReport
from src.orchestration.pillar_registry import PillarRegistry
from src.orchestration.execution_manager import ExecutionManager
from src.orchestration.score_aggregator import ScoreAggregator


logger = logging.getLogger(__name__)


class OrchestrationEngine:
    """
    Core orchestration engine for Five-Pillar AI safety evaluation.
    
    Coordinates parallel execution of AI safety pillar engines, aggregates results,
    and produces comprehensive safety reports.
    
    Architecture:
    1. Fetch registered safety pillars from registry
    2. Execute all pillars in parallel with timeout protection
    3. Aggregate weighted scores from successful pillars
    4. Calculate confidence based on success rate
    5. Generate structured SafetyReport with metadata
    
    Resilience:
    - Individual pillar failures do not crash evaluation
    - Timeout protection per pillar
    - Graceful degradation with reduced confidence
    - Structured error reporting
    """
    
    def __init__(
        self,
        registry: PillarRegistry,
        execution_timeout: float = 5.0,
        min_pillars_required: int = 1
    ):
        """
        Initialize orchestration engine.
        
        Args:
            registry: Pillar registry instance
            execution_timeout: Maximum execution time per pillar (seconds)
            min_pillars_required: Minimum successful pillars for valid result
        """
        self.registry = registry
        self.execution_manager = ExecutionManager(timeout_seconds=execution_timeout)
        self.score_aggregator = ScoreAggregator(min_pillars_required=min_pillars_required)
    
    async def evaluate(
        self,
        input_data: TrustEvaluationInput,
        context: TrustEvaluationContext
    ) -> TrustReport:
        """
        Execute full trust evaluation orchestration.
        
        Flow:
        1. Validate registry has pillars
        2. Execute all pillars in parallel
        3. Aggregate results into final score
        4. Generate comprehensive report
        
        Args:
            input_data: Evaluation input data
            context: Execution context
            
        Returns:
            TrustReport with final score and pillar breakdown
            
        Raises:
            ValueError: If no pillars registered or insufficient successful pillars
        """
        start_time = time.perf_counter()
        
        logger.info(
            f"Starting AI safety evaluation for {input_data.entity_id}",
            extra={"request_id": context.request_id}
        )
        
        # Step 1: Get registered pillars
        pillars = self.registry.get_all_pillars()
        
        if not pillars:
            raise ValueError("No pillars registered in registry")
        
        logger.info(f"Executing {len(pillars)} pillars in parallel")
        
        # Step 2: Execute all pillars in parallel
        pillar_results = await self.execution_manager.execute_all(
            pillars,
            input_data,
            context
        )
        
        # Step 3: Aggregate scores
        try:
            aggregation = self.score_aggregator.aggregate(pillar_results)
        except ValueError as e:
            logger.error(f"Score aggregation failed: {str(e)}")
            raise
        
        # Step 4: Calculate total execution time
        execution_time_ms = (time.perf_counter() - start_time) * 1000
        
        # Step 5: Generate report
        report = TrustReport(
            request_id=context.request_id,
            entity_id=input_data.entity_id,
            final_score=aggregation.final_score,
            pillar_results=pillar_results,
            timestamp=datetime.utcnow(),
            execution_time_ms=round(execution_time_ms, 2)
        )
        
        logger.info(
            f"AI safety evaluation completed: score={aggregation.final_score.value}, "
            f"confidence={aggregation.final_score.confidence}, "
            f"successful={aggregation.successful_pillars}/{len(pillars)}, "
            f"time={execution_time_ms:.2f}ms",
            extra={"request_id": context.request_id}
        )
        
        return report
