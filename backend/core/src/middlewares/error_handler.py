"""Centralized error handling middleware."""

import logging
from uuid import uuid4

from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

logger = logging.getLogger("veldrix.api")


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with structured response and correlation ID."""
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    errors = [
        {"field": ".".join(str(loc) for loc in error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "request_id": request_id,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": errors,
            },
        },
    )


async def generic_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors — log with correlation ID, never surface internals."""
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    logger.error(
        "Unhandled exception request_id=%s path=%s error=%s",
        request_id, request.url.path, exc, exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "request_id": request_id,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            },
        },
    )
