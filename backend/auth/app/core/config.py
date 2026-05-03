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
    STRIPE_PRICE_GROW_MONTHLY: str = ""
    STRIPE_PRICE_GROW_ANNUAL: str = ""
    STRIPE_PRICE_SCALE_MONTHLY: str = ""
    STRIPE_PRICE_SCALE_ANNUAL: str = ""
    VELDRIX_UI_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH), case_sensitive=True, extra="ignore"
    )


settings = Settings()
