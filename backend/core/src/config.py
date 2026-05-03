"""Application configuration from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings:
    """Application settings loaded from environment."""

    def __init__(self) -> None:
        self.JWT_SECRET: str = os.getenv("JWT_SECRET_KEY", "your-secret-key")
        self.JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.APP_ENV: str = os.getenv("APP_ENV", "development")
        self.APP_PORT: int = int(os.getenv("APP_PORT", "8001"))
        self.VELDRIX_INTERNAL_API_KEY: str = os.getenv("VELDRIX_INTERNAL_API_KEY", "")
        self.REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.CIRCUIT_BREAKER_BACKEND: str = os.getenv("CIRCUIT_BREAKER_BACKEND", "memory")
        self.CIRCUIT_BREAKER_REDIS_KEY_PREFIX: str = os.getenv("CIRCUIT_BREAKER_REDIS_KEY_PREFIX", "veldrix:cb")
        self.CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES: int = int(os.getenv("CIRCUIT_BREAKER_FALLBACK_AFTER_FAILURES", "5"))


_settings: Settings | None = None


def get_settings() -> Settings:
    """Get settings instance (created once after env is loaded)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
