"""Shared fixtures for connectors adversarial DB-level tests.

Integrity / tamper tests run ONLY against an explicitly-provided EPHEMERAL Postgres,
never shared/production data (Phase 3 §4 constraint). Provide the URL via:

    ADV_TEST_DATABASE_URL=postgresql+psycopg2://qa:qa@localhost:55432/qa

Recommended ephemeral instance (auto-destroyed):

    docker run -d --name veldrix-qa-pg -e POSTGRES_PASSWORD=qa -e POSTGRES_USER=qa \\
        -e POSTGRES_DB=qa -p 55432:5432 postgres:16-alpine
    # …run tests…
    docker rm -f veldrix-qa-pg

If the URL is unset or unreachable, the DB-level tests SKIP (they are never silently
passed, and never pointed at the app's real DATABASE_URL).
"""

from __future__ import annotations

import os

import pytest

ADV_DB_ENV = "ADV_TEST_DATABASE_URL"


def _make_engine():
    url = os.getenv(ADV_DB_ENV)
    if not url:
        pytest.skip(
            f"{ADV_DB_ENV} not set — DB-level integrity tests require an ephemeral "
            "Postgres (see conftest docstring). Skipped, NOT run against shared data."
        )
    from sqlalchemy import create_engine

    try:
        eng = create_engine(url)
        with eng.connect() as c:
            from sqlalchemy import text

            c.execute(text("SELECT 1"))
        return eng
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"ephemeral DB at {ADV_DB_ENV} unreachable ({exc}); skipping DB-level tests.")


@pytest.fixture()
def adv_engine():
    """An engine bound to the ephemeral DB, with a fresh audit_trails table + the
    Part A append-only trigger applied exactly as main.py::_run_migrations does."""
    from sqlalchemy import text

    eng = _make_engine()
    from src.modules.reports.models import AuditTrail

    # Fresh table each test for isolation.
    with eng.begin() as conn:
        conn.execute(text("DROP TRIGGER IF EXISTS audit_trails_append_only ON audit_trails"))
        conn.execute(text("DROP TABLE IF EXISTS audit_trails CASCADE"))
    AuditTrail.__table__.create(bind=eng)

    # Apply the EXACT append-only trigger DDL from migration 010 / _run_migrations.
    with eng.begin() as conn:
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
    yield eng
    with eng.begin() as conn:
        conn.execute(text("DROP TRIGGER IF EXISTS audit_trails_append_only ON audit_trails"))
        conn.execute(text("DROP TABLE IF EXISTS audit_trails CASCADE"))
    eng.dispose()
