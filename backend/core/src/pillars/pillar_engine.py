"""Base interface for pillar engines."""

from abc import ABC, abstractmethod
from typing import Protocol

from src.domain.types import TrustEvaluationInput, TrustEvaluationContext
from src.pillars.types import PillarResult, PillarMetadata


class PillarEngine(ABC):
    """
    Base interface for Five-Pillar evaluation engines.
    
    Each pillar must implement this interface to participate in trust evaluation.
    Pillars execute independently and return structured results with scoring and metadata.
    """
    
    @property
    @abstractmethod
    def metadata(self) -> PillarMetadata:
        """
        Return pillar identification metadata.
        
        Returns:
            PillarMetadata containing id, name, version, and weight
        """
        pass
    
    @abstractmethod
    async def evaluate(
        self,
        input_data: TrustEvaluationInput,
        context: TrustEvaluationContext
    ) -> PillarResult:
        """
        Evaluate trust based on pillar-specific logic.
        
        Args:
            input_data: Standardized evaluation input
            context: Execution context with request metadata
            
        Returns:
            PillarResult with score, status, and execution metadata
            
        Note:
            Implementations must handle errors gracefully and return
            PillarResult with FAILED status rather than raising exceptions.
        """
        pass


class PillarEngineProtocol(Protocol):
    """
    Protocol definition for structural typing of pillar engines.
    
    Enables duck-typing compatibility for dynamic pillar registration.
    """
    
    @property
    def metadata(self) -> PillarMetadata:
        """Return pillar metadata."""
        ...
    
    async def evaluate(
        self,
        input_data: TrustEvaluationInput,
        context: TrustEvaluationContext
    ) -> PillarResult:
        """Evaluate trust for the given input."""
        ...
