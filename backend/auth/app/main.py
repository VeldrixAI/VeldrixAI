import logging
import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.api.auth import router as auth_router
from app.api.api_keys import router as api_keys_router
from app.api.billing import router as billing_router
from app.api.internal import router as internal_router
from app.api.notifications import router as notifications_router
from app.db.base import Base
from app.db.session import engine, get_db

logger = logging.getLogger(__name__)

# Create database tables (includes Notification table added in models.py)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VeldrixAI Authentication Service", version="1.0.0")

_raw_origins = os.getenv("VELDRIX_CORS_ORIGINS", "http://localhost:3000,http://localhost:5000")
_cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    errors = [{"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(
        status_code=400,
        content={"success": False, "request_id": request_id, "error": {"code": "VALIDATION_ERROR", "details": errors}},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    logger.error("Unhandled exception request_id=%s path=%s error=%s", request_id, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "request_id": request_id, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
    )


app.include_router(auth_router)
app.include_router(api_keys_router)
app.include_router(billing_router)
app.include_router(internal_router)
app.include_router(notifications_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "veldrix-auth"}


@app.get("/health/ready")
def readiness_check():
    db = next(get_db())
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "service": "veldrix-auth", "db": "connected"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "db": str(exc)})
    finally:
        db.close()
