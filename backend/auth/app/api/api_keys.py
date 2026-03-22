from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyResponse, ApiKeyCreated
from app.services.api_key_service import ApiKeyService
from app.core.dependencies import get_current_user
from typing import List
from uuid import UUID

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_api_key(
    key_data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a new API key for the authenticated user"""
    api_key, raw_key = ApiKeyService.create_api_key(db, current_user.id, key_data.name)
    
    return ApiKeyCreated(
        id=api_key.id,
        name=api_key.name,
        api_key=raw_key,
        created_at=api_key.created_at
    )


@router.get("", response_model=List[ApiKeyResponse])
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all API keys for the authenticated user"""
    return ApiKeyService.get_user_api_keys(db, current_user.id)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: UUID,
    permanent: bool = Query(False, description="Permanently delete the key instead of just revoking it"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke (deactivate) or permanently delete an API key"""
    if permanent:
        # Permanently delete the key from database
        success = ApiKeyService.delete_api_key_permanently(db, key_id, current_user.id)
    else:
        # Just deactivate (soft delete)
        success = ApiKeyService.deactivate_api_key(db, key_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )


@router.patch("/{key_id}", response_model=ApiKeyResponse)
def update_api_key(
    key_id: UUID,
    key_data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an API key name"""
    api_key = ApiKeyService.update_api_key_name(db, key_id, current_user.id, key_data.name)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    return api_key
