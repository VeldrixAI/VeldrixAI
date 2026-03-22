"""Dynamic pillar registry for engine management."""

from typing import Dict, List
from src.pillars.pillar_engine import PillarEngine


class PillarRegistry:
    """
    Registry for managing pillar engine instances.
    
    Supports dynamic registration and retrieval of pillar engines.
    Validates uniqueness of pillar identifiers.
    """
    
    def __init__(self):
        self._pillars: Dict[str, PillarEngine] = {}
    
    def register(self, pillar: PillarEngine) -> None:
        """
        Register a pillar engine.
        
        Args:
            pillar: PillarEngine instance to register
            
        Raises:
            ValueError: If pillar with same ID already registered
        """
        pillar_id = pillar.metadata.id
        
        if pillar_id in self._pillars:
            raise ValueError(f"Pillar with ID '{pillar_id}' already registered")
        
        self._pillars[pillar_id] = pillar
    
    def get_all_pillars(self) -> List[PillarEngine]:
        """
        Get all registered pillar engines.
        
        Returns:
            List of registered PillarEngine instances
        """
        return list(self._pillars.values())
    
    def get_pillar(self, pillar_id: str) -> PillarEngine:
        """
        Get specific pillar by ID.
        
        Args:
            pillar_id: Pillar identifier
            
        Returns:
            PillarEngine instance
            
        Raises:
            KeyError: If pillar not found
        """
        return self._pillars[pillar_id]
    
    def count(self) -> int:
        """Get count of registered pillars."""
        return len(self._pillars)
    
    def clear(self) -> None:
        """Clear all registered pillars."""
        self._pillars.clear()


# Global registry instance
_registry = PillarRegistry()


def get_registry() -> PillarRegistry:
    """Get global pillar registry instance."""
    return _registry
