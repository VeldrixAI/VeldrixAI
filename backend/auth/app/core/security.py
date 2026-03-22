from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import bcrypt
import secrets
from app.core.config import settings


def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def generate_api_key() -> str:
    """Generate a cryptographically secure API key with vx-live- prefix."""
    return f"vx-live-{secrets.token_urlsafe(32)}"


def hash_api_key(api_key: str) -> str:
    """Hash API key for secure storage"""
    key_bytes = api_key.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(key_bytes, salt).decode('utf-8')


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify API key against hash"""
    key_bytes = plain_key.encode('utf-8')
    hashed_bytes = hashed_key.encode('utf-8')
    return bcrypt.checkpw(key_bytes, hashed_bytes)


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.JWTError:
        return None
