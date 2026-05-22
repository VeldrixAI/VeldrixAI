from sqlalchemy.orm import Session
from app.db.models import ApiKey, User
from app.core.security import generate_api_key, hash_api_key, verify_api_key
from typing import Optional, Tuple
from uuid import UUID
from datetime import datetime


class ApiKeyService:
    @staticmethod
    def create_api_key(db: Session, user_id: UUID, name: Optional[str] = None) -> Tuple[ApiKey, str]:
        """Create new API key and return both the model and raw key."""
        raw_key = generate_api_key()
        key_hash = hash_api_key(raw_key)

        api_key = ApiKey(
            user_id=user_id,
            key_hash=key_hash,
            key_prefix=raw_key[:16],   # indexed prefix for O(1) pre-filter
            name=name,
        )
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        return api_key, raw_key

    @staticmethod
    def authenticate_api_key(db: Session, raw_key: str) -> Optional[User]:
        """
        Authenticate using API key and return associated user.

        Two-step lookup:
          1. Filter by key_prefix (indexed, O(log n)) — narrows candidates to ~1 row.
          2. bcrypt verify only the matching candidate(s) — never scans all keys.
        """
        if not raw_key.startswith("vx-"):
            return None

        prefix = raw_key[:16]
        candidates = (
            db.query(ApiKey)
            .filter(ApiKey.key_prefix == prefix, ApiKey.is_active == True)
            .all()
        )

        for api_key in candidates:
            if verify_api_key(raw_key, api_key.key_hash):
                api_key.last_used_at = datetime.utcnow()
                user = db.query(User).filter(
                    User.id == api_key.user_id,
                    User.is_active == True,
                ).first()
                if user:
                    user.eval_count_month = (user.eval_count_month or 0) + 1
                db.commit()
                return user

        return None

    @staticmethod
    def get_user_api_keys(db: Session, user_id: UUID):
        """Get all API keys for a user."""
        return db.query(ApiKey).filter(ApiKey.user_id == user_id).all()

    @staticmethod
    def deactivate_api_key(db: Session, key_id: UUID, user_id: UUID) -> bool:
        """Deactivate an API key (soft delete)."""
        api_key = db.query(ApiKey).filter(
            ApiKey.id == key_id,
            ApiKey.user_id == user_id,
        ).first()
        if api_key:
            api_key.is_active = False
            db.commit()
            return True
        return False

    @staticmethod
    def activate_api_key(db: Session, key_id: UUID, user_id: UUID) -> Optional[ApiKey]:
        """Reactivate a previously deactivated API key.
        
        Returns the ApiKey if found and activated, None if not found.
        Only keys that exist and belong to the user can be reactivated.
        Keys that were permanently deleted cannot be revived.
        """
        api_key = db.query(ApiKey).filter(
            ApiKey.id == key_id,
            ApiKey.user_id == user_id,
        ).first()
        if api_key:
            api_key.is_active = True
            api_key.last_used_at = None  # Reset last-used so the activation is clean
            db.commit()
            db.refresh(api_key)
            return api_key
        return None

    @staticmethod
    def delete_api_key_permanently(db: Session, key_id: UUID, user_id: UUID) -> bool:
        """Permanently delete an API key from database."""
        api_key = db.query(ApiKey).filter(
            ApiKey.id == key_id,
            ApiKey.user_id == user_id,
        ).first()
        if api_key:
            db.delete(api_key)
            db.commit()
            return True
        return False

    @staticmethod
    def update_api_key_name(db: Session, key_id: UUID, user_id: UUID, name: Optional[str]) -> Optional[ApiKey]:
        """Update an API key name."""
        api_key = db.query(ApiKey).filter(
            ApiKey.id == key_id,
            ApiKey.user_id == user_id,
        ).first()
        if api_key:
            api_key.name = name
            db.commit()
            db.refresh(api_key)
            return api_key
        return None
