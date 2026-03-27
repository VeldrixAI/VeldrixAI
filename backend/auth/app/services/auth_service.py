from sqlalchemy.orm import Session
from app.db.models import User
from app.core.security import hash_password, verify_password, create_access_token, validate_timezone
from typing import Optional
from uuid import UUID


class AuthService:
    @staticmethod
    def create_user(db: Session, email: str, password: str) -> User:
        hashed_password = hash_password(password)
        user = User(email=email, hashed_password=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
        user = db.query(User).filter(User.email == email).first()
        if not user or not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
        try:
            uuid_obj = UUID(user_id)
            return db.query(User).filter(User.id == uuid_obj).first()
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def generate_token(user: User, timezone: str = "UTC") -> str:
        validated_tz = validate_timezone(timezone)
        return create_access_token(str(user.id), user.role.value, tz=validated_tz)

    @staticmethod
    def deactivate_user(db: Session, user_id: str) -> Optional[User]:
        """Soft delete: set is_active to False instead of deleting the user"""
        try:
            uuid_obj = UUID(user_id)
            user = db.query(User).filter(User.id == uuid_obj).first()
            if user:
                user.is_active = False
                db.commit()
                db.refresh(user)
            return user
        except (ValueError, AttributeError):
            return None
