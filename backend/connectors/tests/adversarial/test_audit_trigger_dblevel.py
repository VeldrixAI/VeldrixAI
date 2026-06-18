"""Domain 3.4 — Audit Chain Tamper-Evidence: DB-LEVEL append-only trigger.
[NIST AI RMF MANAGE / integrity — crown jewel #2]

Guarantee (main.py:84-98, 010_*.sql:46-57): audit_trails is append-only at the DB
layer — a BEFORE UPDATE OR DELETE trigger raises, so even direct SQL cannot tamper or
erase. This is the claim that pure-Python verify_chain tests cannot reach; it requires
real Postgres plpgsql.

Runs ONLY against an ephemeral Postgres (see conftest.py). Never touches shared data.
Uses the REAL _insert_with_chain and the REAL trigger DDL.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InternalError, OperationalError
from sqlalchemy.orm import Session

from src.modules.analytics.audit_hash import verify_chain

TRIGGER_ERRORS = (DBAPIError, InternalError, OperationalError)


def _insert(engine, **kw):
    """Insert one row through the REAL chained-insert path."""
    from src.modules.analytics.audit_controller import _insert_with_chain
    from src.modules.reports.models import AuditTrail

    with Session(engine) as db:
        entry = AuditTrail(id=uuid.uuid4(), **kw)
        _insert_with_chain(db, entry)
        return str(entry.id)


def _tenant_rows(engine, user_id):
    from src.modules.analytics.audit_hash import SYSTEM_TENANT_ID

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT action_type, entity_type, entity_id, user_id, request_id, created_at, "
            "       action_metadata, prev_hash, record_hash, chain_seq FROM audit_trails "
            "WHERE COALESCE(user_id, CAST(:sys AS uuid)) = CAST(:t AS uuid) "
            "ORDER BY chain_seq ASC"
        ), {"sys": SYSTEM_TENANT_ID, "t": user_id}).mappings().all()
    return [dict(r) for r in rows]


# ── 1. DELETE is blocked at the DB layer ───────────────────────────────────────

def test_direct_delete_is_blocked_by_trigger(adv_engine):
    tenant = str(uuid.uuid4())
    rid = _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
                  action_metadata={"decided_action": "block"}, request_id="r1")
    with pytest.raises(TRIGGER_ERRORS) as exc:
        with adv_engine.begin() as conn:
            conn.execute(text("DELETE FROM audit_trails WHERE id = :id"), {"id": rid})
    assert "append-only" in str(exc.value)


def test_bulk_delete_is_blocked(adv_engine):
    tenant = str(uuid.uuid4())
    _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
            action_metadata={"v": 1}, request_id="a")
    _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
            action_metadata={"v": 2}, request_id="b")
    with pytest.raises(TRIGGER_ERRORS):
        with adv_engine.begin() as conn:
            conn.execute(text("DELETE FROM audit_trails"))


# ── 2. UPDATE is blocked at the DB layer (tamper attempt) ──────────────────────

def test_direct_update_metadata_is_blocked(adv_engine):
    tenant = str(uuid.uuid4())
    rid = _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
                  action_metadata={"decided_action": "block"}, request_id="r1")
    with pytest.raises(TRIGGER_ERRORS) as exc:
        with adv_engine.begin() as conn:
            conn.execute(text(
                "UPDATE audit_trails SET action_metadata = :m WHERE id = :id"
            ), {"m": '{"decided_action": "allow"}', "id": rid})
    assert "append-only" in str(exc.value)


def test_update_hash_columns_is_blocked(adv_engine):
    """An attacker can't even re-write the chain columns to cover their tracks."""
    tenant = str(uuid.uuid4())
    rid = _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
                  action_metadata={"v": 1}, request_id="r1")
    with pytest.raises(TRIGGER_ERRORS):
        with adv_engine.begin() as conn:
            conn.execute(text("UPDATE audit_trails SET record_hash = 'sha256:deadbeef' WHERE id = :id"),
                         {"id": rid})


# ── 3. INSERT (append) is allowed and the real chain verifies ──────────────────

def test_append_is_allowed_and_chain_verifies(adv_engine):
    tenant = str(uuid.uuid4())
    for i in range(3):
        _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
                action_metadata={"seq": i}, request_id=f"r{i}")
    rows = _tenant_rows(adv_engine, tenant)
    assert len(rows) == 3
    assert verify_chain(rows) is None          # intact end-to-end
    assert [r["chain_seq"] for r in rows] == [0, 1, 2]


def test_chain_links_each_row_to_predecessor(adv_engine):
    tenant = str(uuid.uuid4())
    _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
            action_metadata={"seq": 0}, request_id="r0")
    _insert(adv_engine, user_id=uuid.UUID(tenant), action_type="policy_decision",
            action_metadata={"seq": 1}, request_id="r1")
    rows = _tenant_rows(adv_engine, tenant)
    assert rows[1]["prev_hash"] == rows[0]["record_hash"]
