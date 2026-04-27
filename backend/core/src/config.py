"""Application configuration from environment variables."""

import os
from pathlib import Path
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings:
    """Application settings loaded from environment."""

    JWT_SECRET: str = os.getenv("JWT_SECRET_KEY", "your-secret-key")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    APP_PORT: int = int(os.getenv("APP_PORT", "8001"))

    # ── VeldrixAI SDK / API auth ───────────────────────────────────────────────
    # Set VELDRIX_INTERNAL_API_KEY to require X-Veldrix-Key on /api/v1/analyze.
    # Leave empty to run in dev/demo mode (no auth enforced).
    VELDRIX_INTERNAL_API_KEY: str = os.getenv("VELDRIX_INTERNAL_API_KEY", "")

    # ── Circuit Breaker Backend ────────────────────────────────────────────────
    # "redis"  — shared state across all uvicorn workers (production default)
    # "memory" — per-worker in-process state (requires no additional infra)
    #
    # When backend=redis and Redis is unreachable, the service automatically
    # degrades to in-process mode and logs a WARNING. The inference pipeline
    # never fails due to Redis unavailability.
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CIRCUIT_BREAKER_BACKEND: str = os.getenv("CIRCUIT_BREAKER_BACKEND", "memory")
    CIRCUIT_BREAKER_REDIS_KEY_PREFIX: str = os.getenv(
        "CIRCUIT_BREAKER_REDIS_KEY_PREFIX", "veldrix:cb"
    )
    CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES: int = int(
        os.getenv("CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES", "5")
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
