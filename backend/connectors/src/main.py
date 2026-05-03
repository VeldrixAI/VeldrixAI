import logging
import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from src.db.base import get_db
from src.modules.reports.controllers.report_controller import router as reports_router
from src.modules.analytics.controller import router as analytics_router
from src.modules.analytics.audit_controller import router as audit_trails_router
from src.modules.analytics.latency_controller import router as latency_router
from src.modules.prompts.controller import router as prompts_router
from src.modules.models.controller import router as models_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="VeldrixAI Connectors - Reports API",
    description="Report generation and storage pipeline",
    version="1.0.0"
)

# CORS: restrict to configured origins — never wildcard in production
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


# Include routers
app.include_router(reports_router)
app.include_router(analytics_router)
app.include_router(audit_trails_router)
app.include_router(latency_router)
app.include_router(prompts_router)
app.include_router(models_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "veldrix-connectors"}


@app.get("/health/ready")
def readiness_check():
    db_gen = get_db()
    db = next(db_gen)
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "service": "veldrix-connectors", "db": "connected"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "db": str(exc)})
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
