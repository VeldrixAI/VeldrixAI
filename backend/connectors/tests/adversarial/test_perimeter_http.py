"""Domain 3.5 — Service Perimeter: HTTP-surface attacks (BOLA + unauth disclosure).
[OWASP API1 BOLA, API5 BFLA, API3 excessive data exposure]

Reproduces, against an ephemeral Postgres, two perimeter weaknesses identified in
RECON-QA §5a/§8:
  * F-BOLA-1: GET /api/audit-trails/{request_id}/detail has an "unscoped fallback"
    (audit_controller.py:478-501) that returns ANOTHER tenant's record on a user_id
    mismatch.
  * F-UNAUTH-1: GET /api/policy/internal/{enforcement-mode,preflight-report} and
    /api/audit-trails/internal/chain-health have NO auth gate and accept an arbitrary
    tenant_id (cross-tenant disclosure / unbounded resource consumption).

We mount the real routers on a throwaway FastAPI app, override get_db to the ephemeral
engine, and override get_current_user (so no JWT/secret is needed). No shared data, no
production auth. Skips if no ephemeral DB (see conftest.py).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    _HTTP_OK = True
except Exception:  # pragma: no cover
    _HTTP_OK = False

pytestmark = pytest.mark.skipif(not _HTTP_OK, reason="fastapi TestClient/httpx unavailable")


def _seed_audit_row(engine, user_id, request_id, meta):
    from src.modules.analytics.audit_controller import _insert_with_chain
    from src.modules.reports.models import AuditTrail

    with Session(engine) as db:
        entry = AuditTrail(id=uuid.uuid4(), user_id=uuid.UUID(user_id),
                           action_type="policy_decision", action_metadata=meta,
                           request_id=request_id, log_type="EVALUATION")
        _insert_with_chain(db, entry)
        return str(entry.id)


def _app_as_user(engine, current_user_id):
    """Throwaway app: real audit router, get_db→ephemeral engine, get_current_user→fixed."""
    from src.db.base import get_db
    from src.core.middleware.auth import get_current_user
    from src.modules.analytics.audit_controller import router as audit_router

    app = FastAPI()
    app.include_router(audit_router)

    def _override_db():
        db = Session(engine)
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: {
        "id": current_user_id, "email": f"{current_user_id}@x", "role": "user"
    }
    return TestClient(app)


# ── F-BOLA-1: cross-tenant audit record read via unscoped fallback ─────────────

def test_bola_detail_returns_other_tenants_record_uuid_request_id(adv_engine):
    """[HELD — Finding F-BOLA-1 fixed | OWASP API1:2023 BOLA]

    Tenant B owns a record whose request_id is UUID-shaped. Tenant A (a different
    authenticated user) requests it. The unscoped "debug" fallback that used to leak
    B's record (audit_controller.py:478-501) has been removed: every lookup path is
    tenant-scoped, so a record owned by another tenant is indistinguishable from
    "not found". A must get 404 and NONE of B's data may be serialized.

    Previously this test asserted the DEFEAT (HTTP 200 + B's record). It now asserts
    the fix — the assertion changed because the behavior changed, not because the test
    was weakened: the same attack is run; the leak is now refused.
    """
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    secret_rid = str(uuid.uuid4())                       # UUID-shaped request_id
    _seed_audit_row(adv_engine, tenant_b, secret_rid,
                    {"decided_action": "block", "secret": "tenant-B-only",
                     "prompt_preview": "B-PROMPT-SECRET", "response_preview": "B-RESPONSE-SECRET"})

    client = _app_as_user(adv_engine, tenant_a)          # authenticated as A
    resp = client.get(f"/api/audit-trails/{secret_rid}/detail")

    assert resp.status_code in (403, 404), "cross-tenant detail fetch must be refused"
    # Belt-and-suspenders: NO byte of B's record may appear in the response body,
    # regardless of status code or serialization shape.
    raw = resp.text
    assert "tenant-B-only" not in raw
    assert "B-PROMPT-SECRET" not in raw
    assert "B-RESPONSE-SECRET" not in raw
    assert tenant_b not in raw
    body = resp.json()
    assert body.get("request_id") != secret_rid          # B's record not returned
    assert body.get("metadata") in (None, {})            # no other-tenant metadata/preview


def test_bola_non_uuid_request_id_is_404(adv_engine):
    """Companion control: a NON-UUID request_id for another tenant's row also returns
    404. (Pre-fix this was an *accidental* mitigation via an aborted transaction; it is
    now the same designed tenant-scoping behavior as the UUID case above.)"""
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    _seed_audit_row(adv_engine, tenant_b, "secret-req", {"secret": "tenant-B-only"})
    client = _app_as_user(adv_engine, tenant_a)
    resp = client.get("/api/audit-trails/secret-req/detail")
    assert resp.status_code == 404
    assert "tenant-B-only" not in resp.text


def test_detail_scoped_lookup_is_correct_for_owner(adv_engine):
    """Control: the legitimate owner can read their own record (so the BOLA test isn't
    just 'detail always returns something')."""
    tenant_b = str(uuid.uuid4())
    own_rid = str(uuid.uuid4())
    _seed_audit_row(adv_engine, tenant_b, own_rid, {"decided_action": "allow"})
    client = _app_as_user(adv_engine, tenant_b)
    resp = client.get(f"/api/audit-trails/{own_rid}/detail")
    assert resp.status_code == 200
    assert resp.json()["request_id"] == own_rid


# ── F-UNAUTH-1: internal endpoints now require the fail-safe token ─────────────

def _app_with_routers(adv_engine, routers):
    """Throwaway app mounting the given real routers with get_db → ephemeral engine.
    No auth override — internal/* routes must enforce their own token dependency."""
    from src.db.base import get_db
    from fastapi import FastAPI

    app = FastAPI()
    for r in routers:
        app.include_router(r)

    def _override_db():
        db = Session(adv_engine)
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_internal_audit_write_requires_no_auth(adv_engine, monkeypatch):
    """[HELD — Finding F-UNAUTH-1 fixed] The internal audit-write endpoint now requires
    the shared INTERNAL_SERVICE_TOKEN. Without a valid token the forged-injection POST
    is refused (503 when the server has no token configured, 401 when it does) — an
    unauthenticated caller can no longer poison a tenant's hash chain.

    (Test name kept for report-traceability; the assertion flipped DEFEAT→HELD.)"""
    from src.modules.analytics.audit_controller import router as audit_router

    payload = {
        "action_type": "policy_decision",
        "user_id": str(uuid.uuid4()),
        "metadata": {"request_id": "injected-1", "decided_action": "allow", "forged": True},
    }

    # Server with NO token configured → route disabled (fail-safe 503), never open.
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    client = _app_with_routers(adv_engine, [audit_router])
    resp = client.post("/api/audit-trails/internal/audit-trail", json=payload)
    assert resp.status_code == 503
    assert "inserted" not in resp.text

    # Server WITH a token configured, caller presents none/wrong → 401.
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "s3cret")
    resp_noauth = client.post("/api/audit-trails/internal/audit-trail", json=payload)
    assert resp_noauth.status_code == 401
    resp_wrong = client.post("/api/audit-trails/internal/audit-trail", json=payload,
                             headers={"X-Internal-Token": "wrong"})
    assert resp_wrong.status_code == 401


def test_internal_audit_write_accepts_valid_token(adv_engine, monkeypatch):
    """Sibling control: a VALID token still works (the gate isn't vacuously closed)."""
    from src.modules.analytics.audit_controller import router as audit_router

    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "s3cret")
    client = _app_with_routers(adv_engine, [audit_router])
    resp = client.post(
        "/api/audit-trails/internal/audit-trail",
        json={
            "action_type": "policy_decision",
            "user_id": str(uuid.uuid4()),
            "metadata": {"request_id": "legit-1", "decided_action": "allow"},
        },
        headers={"X-Internal-Token": "s3cret"},
    )
    assert resp.status_code == 201
    assert resp.json()["inserted"] is True


def test_internal_disclosure_routes_reject_unauthenticated(adv_engine, monkeypatch):
    """[HELD — Finding F-UNAUTH-1] The read-only disclosure routes (enforcement-mode,
    preflight-report, chain-health) leaked cross-tenant mode/blast/length intelligence
    to any unauthenticated scraper. They now require the token (503 unconfigured)."""
    from src.modules.policy.policy_controller import router as policy_router
    from src.modules.analytics.chain_health_controller import router as chain_router

    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    client = _app_with_routers(adv_engine, [policy_router, chain_router])
    tenant = str(uuid.uuid4())

    for method, url in [
        ("GET", f"/api/policy/internal/enforcement-mode?tenant_id={tenant}&policy_id=p1"),
        ("GET", f"/api/policy/internal/preflight-report?tenant_id={tenant}"),
        ("GET", f"/api/audit-trails/internal/chain-health?tenant_id={tenant}"),
        ("POST", "/api/audit-trails/internal/chain-health/refresh"),
    ]:
        resp = client.request(method, url)
        assert resp.status_code == 503, f"{method} {url} must be gated (got {resp.status_code})"
        assert tenant not in resp.text  # no tenant echo / disclosure on the rejection

    # With a token configured but absent/ wrong → 401, still no disclosure.
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "s3cret")
    r = client.get(f"/api/policy/internal/enforcement-mode?tenant_id={tenant}&policy_id=p1")
    assert r.status_code == 401


def test_metrics_exposition_carries_no_per_tenant_uuid(adv_engine):
    """[HELD — Finding F-UNAUTH-1 (/metrics)] The unauthenticated /metrics scrape target
    must not emit raw per-tenant UUIDs. After verifying a tenant's chain, the rendered
    exposition contains an opaque hashed label, never the tenant UUID."""
    from src.modules.analytics import chain_metrics

    tenant = str(uuid.uuid4())
    _seed_audit_row(adv_engine, tenant, str(uuid.uuid4()), {"decided_action": "allow"})
    with Session(adv_engine) as db:
        chain_metrics.verify_tenant(db, tenant)

    body, _ct = chain_metrics.render()
    text_body = body.decode("utf-8") if isinstance(body, (bytes, bytearray)) else str(body)
    # prometheus_client may be absent in this env (no-op shim) — only assert when real.
    if "veldrix_audit_chain" in text_body:
        assert tenant not in text_body, "raw tenant UUID leaked into /metrics exposition"
        assert ("t-" + __import__("hashlib").sha256(tenant.encode()).hexdigest()[:16]) in text_body
