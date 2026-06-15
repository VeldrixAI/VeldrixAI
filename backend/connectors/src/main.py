import logging
import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from src.db.base import Base, engine, get_db

# Import all models so SQLAlchemy registers them with Base.metadata
# before create_all runs. Without these imports the tables are never created.
import src.modules.reports.models  # noqa: F401
import src.modules.analytics.models  # noqa: F401
import src.modules.prompts.models  # noqa: F401
import src.modules.support.models  # noqa: F401

# Create all tables on startup (idempotent — safe to run every boot)
Base.metadata.create_all(bind=engine)


# Idempotent schema migrations — safe to run on every boot.
#
# This codebase has no SQL-file migration runner for connectors: production
# deploys are `docker compose pull && up`, and schema comes from create_all().
# create_all() creates *missing tables* but never adds columns to an existing
# table nor creates triggers — so additive changes to a live table must run
# here, mirroring backend/auth/app/main.py::_run_migrations. The canonical,
# human-readable form of this migration also lives at
# backend/connectors/migrations/010_audit_hash_chain.sql for review.
def _run_migrations():
    from src.modules.analytics.audit_hash import (
        GENESIS_HASH,
        SYSTEM_TENANT_ID,
        compute_record_hash,
    )

    with engine.connect() as conn:
        # 1. Additive columns for the audit hash chain (no-op once present).
        conn.execute(text("ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS prev_hash   VARCHAR(80)"))
        conn.execute(text("ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS record_hash VARCHAR(80)"))
        conn.execute(text("ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS chain_seq   BIGINT"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_trails_record_hash ON audit_trails (record_hash)"))
        conn.commit()

        # 2. Backfill the chain for any unhashed rows. MUST happen before the
        #    append-only trigger exists (the trigger would otherwise block these
        #    UPDATEs — N5 ordering). Drop the trigger first so re-runs are safe.
        conn.execute(text("DROP TRIGGER IF EXISTS audit_trails_append_only ON audit_trails"))
        conn.commit()

        rows = conn.execute(text(
            "SELECT id, user_id, action_type, entity_type, entity_id, request_id, "
            "       created_at, action_metadata "
            "FROM audit_trails WHERE record_hash IS NULL "
            "ORDER BY COALESCE(user_id, CAST(:sys AS uuid)), created_at, id"
        ), {"sys": SYSTEM_TENANT_ID}).mappings().all()

        # Walk each tenant's rows in a deterministic order, chaining forward.
        heads: dict[str, tuple[str, int]] = {}  # tenant_key -> (prev_hash, last_seq)
        for r in rows:
            tk = str(r["user_id"]) if r["user_id"] else SYSTEM_TENANT_ID
            prev_hash, last_seq = heads.get(tk, (GENESIS_HASH, -1))
            rec_hash = compute_record_hash(
                prev_hash=prev_hash,
                action_type=r["action_type"],
                entity_type=r["entity_type"],
                entity_id=r["entity_id"],
                user_id=r["user_id"],
                request_id=r["request_id"],
                created_at=r["created_at"],
                action_metadata=r["action_metadata"],
            )
            seq = last_seq + 1
            conn.execute(text(
                "UPDATE audit_trails SET prev_hash = :p, record_hash = :h, chain_seq = :s "
                "WHERE id = :id"
            ), {"p": prev_hash, "h": rec_hash, "s": seq, "id": r["id"]})
            heads[tk] = (rec_hash, seq)
        conn.commit()

        # 3. (Re)create the append-only enforcement trigger. Blocks UPDATE and
        #    DELETE at the DB layer so even direct SQL cannot tamper or erase.
        conn.execute(text(
            "CREATE OR REPLACE FUNCTION audit_trails_block_mutation() "
            "RETURNS TRIGGER AS $$ BEGIN "
            "  RAISE EXCEPTION 'audit_trails is append-only; UPDATE and DELETE are not permitted' "
            "    USING ERRCODE = 'check_violation'; "
            "END; $$ LANGUAGE plpgsql"
        ))
        conn.execute(text(
            "CREATE TRIGGER audit_trails_append_only "
            "BEFORE UPDATE OR DELETE ON audit_trails "
            "FOR EACH ROW EXECUTE FUNCTION audit_trails_block_mutation()"
        ))
        conn.commit()


try:
    _run_migrations()
except Exception as _mig_exc:  # pragma: no cover - boot-time best effort
    logging.getLogger(__name__).warning(
        "Audit hash-chain migration skipped (may already be applied): %s", _mig_exc
    )

from src.modules.reports.controllers.report_controller import router as reports_router
from src.modules.analytics.controller import router as analytics_router
from src.modules.analytics.audit_controller import router as audit_trails_router
from src.modules.analytics.latency_controller import router as latency_router
from src.modules.analytics.metrics_controller import router as metrics_router
from src.modules.prompts.controller import router as prompts_router
from src.modules.models.controller import router as models_router
from src.modules.support.controllers.support_controller import router as support_router

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
app.include_router(metrics_router)
app.include_router(prompts_router)
app.include_router(models_router)
app.include_router(support_router)


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
