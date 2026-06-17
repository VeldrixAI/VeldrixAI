"""Chain-health metrics — verification result drives the per-tenant gauges (B.2).

DB-free: the row fetch is stubbed so we exercise the verify→gauge logic directly,
reusing the Part A hash recipe to build an intact chain and a tampered one.
"""

from __future__ import annotations

from datetime import datetime, timezone

from src.modules.analytics import chain_metrics
from src.modules.analytics.audit_hash import GENESIS_HASH, compute_record_hash

_NOW = datetime(2026, 6, 16, 12, 0, 0, tzinfo=timezone.utc)
TENANT = "11111111-1111-1111-1111-111111111111"


def _identity(seq: int) -> dict:
    return {
        "action_type": "policy_decision",
        "entity_type": "policy_engine",
        "entity_id": None,
        "user_id": TENANT,
        "request_id": f"req-{seq}",
        "created_at": _NOW,
        "action_metadata": {"seq": seq},
    }


def _chain(n: int) -> list[dict]:
    rows, prev = [], GENESIS_HASH
    for seq in range(n):
        ident = _identity(seq)
        rec = compute_record_hash(prev_hash=prev, **ident)
        rows.append({**ident, "prev_hash": prev, "record_hash": rec, "chain_seq": seq})
        prev = rec
    return rows


def test_intact_chain_reports_intact(monkeypatch):
    rows = _chain(3)
    monkeypatch.setattr(chain_metrics, "_fetch_tenant_rows", lambda db, tk: rows)

    result = chain_metrics.verify_tenant(db=None, tenant_key=TENANT)
    assert result["intact"] is True
    assert result["length"] == 3
    assert result["error"] is None
    if chain_metrics.PROMETHEUS_AVAILABLE:
        assert chain_metrics.CHAIN_INTACT.labels(tenant=TENANT)._value.get() == 1


def test_tampered_chain_is_detected(monkeypatch):
    rows = _chain(3)
    rows[1]["record_hash"] = "sha256:" + "f" * 64  # forge a row
    monkeypatch.setattr(chain_metrics, "_fetch_tenant_rows", lambda db, tk: rows)

    result = chain_metrics.verify_tenant(db=None, tenant_key=TENANT)
    assert result["intact"] is False
    assert "tampered" in result["error"] or "chain break" in result["error"]
    if chain_metrics.PROMETHEUS_AVAILABLE:
        assert chain_metrics.CHAIN_INTACT.labels(tenant=TENANT)._value.get() == 0


def test_metrics_render_is_payload_free(monkeypatch):
    rows = _chain(2)
    monkeypatch.setattr(chain_metrics, "_fetch_tenant_rows", lambda db, tk: rows)
    chain_metrics.verify_tenant(db=None, tenant_key=TENANT)

    body, content_type = chain_metrics.render()
    text = body.decode("utf-8")
    assert "text/plain" in content_type
    if chain_metrics.PROMETHEUS_AVAILABLE:
        assert "veldrix_audit_chain_intact" in text
        # The tenant key labels the gauge, but no record payload content leaks.
        assert "policy_decision" not in text and "req-" not in text
