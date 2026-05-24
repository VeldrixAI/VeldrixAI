"""Internal service-to-service endpoints. No user auth required."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.models import User
from app.db.session import get_db
from app.services.api_key_service import ApiKeyService

router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)


class ValidateKeyRequest(BaseModel):
    api_key: str


class IncrementEvalRequest(BaseModel):
    user_id: str


@router.post("/validate-api-key")
def validate_api_key(body: ValidateKeyRequest, db: Session = Depends(get_db)):
    """Validate an API key and return the associated user. Called by core service."""
    user = ApiKeyService.authenticate_api_key(db, body.api_key)
    if not user:
        return JSONResponse(status_code=401, content={"valid": False})
    return {
        "valid": True,
        "user_id": str(user.id),
        "email": user.email,
        "plan_tier": user.plan_tier,
        "eval_count_month": user.eval_count_month,
    }


@router.post("/increment-eval-count")
def increment_eval_count(body: IncrementEvalRequest, db: Session = Depends(get_db)):
    """Increment monthly eval counter for a JWT-authenticated user. Called by core service."""
    try:
        uuid_obj = UUID(body.user_id)
        user = db.query(User).filter(User.id == uuid_obj, User.is_active == True).first()
        if user:
            user.eval_count_month = (user.eval_count_month or 0) + 1
            db.commit()
            return {"ok": True, "eval_count_month": user.eval_count_month}
    except (ValueError, AttributeError):
        pass
    return JSONResponse(status_code=404, content={"ok": False})
