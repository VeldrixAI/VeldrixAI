"""Per-tenant audit-chain health metrics (Part B / B.2 — the auditor-facing signal).

Surfaces the Part A hash-chain verification result as Prometheus gauges so the
Grafana "chain-health" panel can show, per tenant: is the chain intact, when was it
last verified, and how long it is. This is the trust signal an auditor or a security
reviewer reads — "prove nothing was altered" — rendered as live telemetry.

Verification is DB work, so it is NOT run on every scrape; an internal endpoint
(``chain_health_controller``) triggers a verification pass (ops/cron-driven) which
updates these gauges. ``/metrics`` then just renders the last-known values cheaply.

Labels are the tenant key (a UUID, or the reserved system-tenant sentinel). The
chain verification reads only row *identity + hashes* — never the governed payload —
so nothing here exposes record content.

``prometheus_client`` is optional at import (no-op shims otherwise) so connectors
tests run without the dependency; production installs it (see requirements.txt).
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.modules.analytics.audit_hash import SYSTEM_TENANT_ID, verify_chain

logger = logging.getLogger("veldrix.audit.chain_metrics")

PROMETHEUS_AVAILABLE = True
try:  # pragma: no cover - both branches exercised across environments
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest
except Exception:
    PROMETHEUS_AVAILABLE = False
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

    class _Noop:
        def __init__(self, *_a, **_k):
            pass

        def labels(self, *_a, **_k):
            return self

        def set(self, *_a, **_k):
            pass

        def inc(self, *_a, **_k):
            pass

    Counter = Gauge = _Noop  # type: ignore[assignment]

    def generate_latest(*_a, **_k):  # type: ignore[misc]
        return b"# prometheus_client not installed; chain metrics are no-ops\n"


CHAIN_INTACT = Gauge(
    "veldrix_audit_chain_intact",
    "1 if the tenant's audit hash chain verifies end-to-end, 0 if a break/tamper was found.",
    ["tenant"],
)
CHAIN_LAST_VERIFIED = Gauge(
    "veldrix_audit_chain_last_verified_timestamp",
    "Unix timestamp of the last chain verification for the tenant.",
    ["tenant"],
)
CHAIN_LENGTH = Gauge(
    "veldrix_audit_chain_length",
    "Number of records in the tenant's audit chain at last verification.",
    ["tenant"],
)
CHAIN_VERIFICATIONS = Counter(
    "veldrix_audit_chain_verifications_total",
    "Chain verification passes run, by result.",
    ["result"],  # intact | broken
)


def _fetch_tenant_rows(db: Session, tenant_key: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action_type, entity_type, entity_id, user_id, request_id, "
            "       created_at, action_metadata, prev_hash, record_hash, chain_seq "
            "FROM audit_trails "
            "WHERE COALESCE(user_id, CAST(:sys AS uuid)) = CAST(:tenant AS uuid) "
            "ORDER BY chain_seq ASC"
        ),
        {"sys": SYSTEM_TENANT_ID, "tenant": tenant_key},
    ).mappings().all()
    return [dict(r) for r in rows]


def verify_tenant(db: Session, tenant_key: str) -> Dict[str, Any]:
    """Verify one tenant's chain and update its gauges. Returns a JSON-able summary."""
    rows = _fetch_tenant_rows(db, tenant_key)
    error = verify_chain(rows)
    intact = error is None
    now = time.time()
    CHAIN_INTACT.labels(tenant=tenant_key).set(1 if intact else 0)
    CHAIN_LAST_VERIFIED.labels(tenant=tenant_key).set(now)
    CHAIN_LENGTH.labels(tenant=tenant_key).set(len(rows))
    CHAIN_VERIFICATIONS.labels(result="intact" if intact else "broken").inc()
    if not intact:
        logger.error("chain_metrics.tenant_chain_broken tenant=%s: %s", tenant_key, error)
    return {
        "tenant": tenant_key,
        "intact": intact,
        "length": len(rows),
        "error": error,
        "verified_at": now,
    }


def verify_all(db: Session) -> Dict[str, Any]:
    """Verify every tenant chain present in audit_trails. Ops/cron entry point."""
    tenant_keys = [
        str(r[0])
        for r in db.execute(
            text(
                "SELECT DISTINCT COALESCE(user_id, CAST(:sys AS uuid)) AS tk "
                "FROM audit_trails"
            ),
            {"sys": SYSTEM_TENANT_ID},
        ).all()
    ]
    results = [verify_tenant(db, tk) for tk in tenant_keys]
    broken = [r for r in results if not r["intact"]]
    return {"tenants": len(results), "broken": len(broken), "results": results}


def render() -> tuple[bytes, str]:
    """Return ``(body, content_type)`` for the connectors ``GET /metrics`` handler."""
    return generate_latest(), CONTENT_TYPE_LATEST
