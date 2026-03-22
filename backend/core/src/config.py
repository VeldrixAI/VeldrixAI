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


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
