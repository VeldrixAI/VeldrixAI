from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User
from app.schemas.user import UserRegister, UserLogin, Token, UserResponse
from app.services.auth_service import AuthService
from app.services.email_service import email_service
from app.core.dependencies import get_current_user

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = AuthService.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = AuthService.create_user(db, user_data.email, user_data.password)

    # Send welcome email — best-effort, never blocks the registration response
    try:
        email_service.send_auth_welcome(
            to_email=user.email,
            user_name=user.email.split("@")[0],
        )
    except Exception:
        pass

    return user


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    user = AuthService.authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    access_token = AuthService.generate_token(user)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/onboarding/complete", status_code=200)
def complete_onboarding(current_user: User = Depends(get_current_user)):
    """
    Called by the frontend when a user finishes the onboarding wizard.
    Fires the onboarding-complete email (best-effort — never fails the request).
    """
    plan = (current_user.plan_tier or "free").title()
    try:
        email_service.send_onboarding_complete(
            to_email=current_user.email,
            user_name=current_user.email.split("@")[0],
            plan_name=plan,
        )
    except Exception:
        pass
    return {"success": True, "message": "Onboarding complete"}
