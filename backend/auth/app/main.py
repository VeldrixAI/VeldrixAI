from fastapi import FastAPI
from app.api.auth import router as auth_router
from app.api.api_keys import router as api_keys_router
from app.api.billing import router as billing_router
from app.api.internal import router as internal_router
from app.api.notifications import router as notifications_router
from app.db.base import Base
from app.db.session import engine

# Create database tables (includes Notification table added in models.py)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VeldrixAI Authentication Service", version="1.0.0")

app.include_router(auth_router)
app.include_router(api_keys_router)
app.include_router(billing_router)
app.include_router(internal_router)
app.include_router(notifications_router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
