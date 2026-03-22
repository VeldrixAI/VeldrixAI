"""JWT authentication middleware."""

from typing import Optional
from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from src.config import get_settings

settings = get_settings()


async def verify_jwt_token(authorization: str = Header(...)) -> str:
    """
    Verify JWT token and extract user ID.
    
    Args:
        authorization: Authorization header with Bearer token
        
    Returns:
        User ID from token
        
    Raises:
        HTTPException: 401 if token invalid, 403 if user inactive
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Check user status (stub - would query DB in production)
        if payload.get("status") == "inactive":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        return user_id
        
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
