"""Main FastAPI application."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from src.api.trust_controller import router as trust_router
from src.api.v1.analyze import router as analyze_v1_router
from src.core.sse import router as sse_router
from src.core.startup import warmup, shutdown
from src.middlewares.error_handler import (
    validation_exception_handler,
    generic_exception_handler,
)


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Probe NVIDIA NIM endpoints on startup; close httpx client on shutdown."""
    logger.info("VeldrixAI Core starting — probing NVIDIA NIM endpoints...")
    await warmup()
    logger.info("VeldrixAI Core ready.")
    yield
    logger.info("VeldrixAI Core shutting down...")
    await shutdown()


app = FastAPI(
    title="VeldrixAI Trust API",
    description="Five-Pillar Trust Evaluation Engine",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Register routers
app.include_router(trust_router)
app.include_router(analyze_v1_router)  # POST /api/v1/analyze, GET /api/v1/pillars|health
app.include_router(sse_router)          # GET  /api/v1/stream


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
