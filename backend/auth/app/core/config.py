from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # Stripe billing
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_PRICE_GROW_MONTHLY: str = ""
    STRIPE_PRICE_GROW_ANNUAL: str = ""
    STRIPE_PRICE_SCALE_MONTHLY: str = ""
    STRIPE_PRICE_SCALE_ANNUAL: str = ""
    VELDRIX_UI_URL: str = "http://localhost:5000"

    # Email (Resend — https://resend.com)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@veldrixai.ca"
    EMAIL_FROM_NAME: str = "VeldrixAI"
    EMAIL_SUPPORT_ADDRESS: str = "rudramani031@veldrixai.ca"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH), case_sensitive=True, extra="ignore"
    )


settings = Settings()
