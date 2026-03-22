from sqlalchemy.orm import Session
from src.modules.reports.models import AuditTrail, ActionType
from typing import Optional, Dict, Any
from uuid import UUID


class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        user_id: Optional[UUID],
        action_type: ActionType,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> AuditTrail:
        """
        Log an action to the audit trail
        
        Args:
            db: Database session
            user_id: User performing the action
            action_type: Type of action
            entity_type: Type of entity affected
            entity_id: ID of entity affected
            metadata: Additional metadata
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Created AuditTrail record
        """
        audit_entry = AuditTrail(
            user_id=user_id,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            action_metadata=metadata,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        db.add(audit_entry)
        db.commit()
        db.refresh(audit_entry)
        
        return audit_entry
