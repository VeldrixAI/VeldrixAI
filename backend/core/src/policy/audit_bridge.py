"""Bridge from a :class:`~src.policy.engine.Decision` to the existing AuditLog.

The Policy Engine does NOT own an audit store and does NOT alter the audit layer.
It consumes the connectors service's existing append endpoint discovered in Phase 0::

    POST {CONNECTORS_URL}/api/audit-trails/internal/audit-trail
    body: { action_type, entity_type, user_id, actor_email, metadata }

(see backend/connectors/src/modules/analytics/audit_controller.py:224 and RECON §3).

Each decision writes exactly ONE record. The connectors endpoint already de-dupes on
``(request_id, action_type)`` so a retried decision cannot double-write. The full
decision metadata (policy version + checksum + signal snapshot + all rule
evaluations + winning-rule reason + decided_action/enforced/mode) travels in
``metadata`` and is sufficient to reproduce the decision offline.

The default sink is fire-and-forget: it schedules the POST on the running event loop
and returns immediately, so the sub-millisecond decision path is never blocked by I/O.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict

logger = logging.getLogger("veldrix.policy.audit")

CONNECTORS_URL = os.getenv(
    "VELDRIX_CONNECTORS_URL", os.getenv("CONNECTORS_URL", "http://localhost:8002")
)

_INTERNAL_AUDIT_PATH = "/api/audit-trails/internal/audit-trail"


def build_audit_payload(record: Dict[str, Any]) -> Dict[str, Any]:
    """Map a decision's audit metadata onto the connectors ``InternalAuditRequest``.

    ``action_type`` distinguishes a normal decision from an engine-error record, so
    operators can query either class and the idempotency key stays meaningful.
    """
    is_error = bool(record.get("engine_error"))
    return {
        "action_type": "policy_engine_error" if is_error else "policy_decision",
        "entity_type": "policy_engine",
        "user_id": record.get("tenant_id"),
        "actor_email": None,
        "metadata": record,
    }


async def _post(payload: Dict[str, Any]) -> None:
    """POST one audit record to connectors. Never raises out of the task."""
    target = f"{CONNECTORS_URL}{_INTERNAL_AUDIT_PATH}"
    try:
        from src.core.http_pool import get_internal_client

        client = get_internal_client()
        resp = await client.post(target, json=payload)
        if resp.status_code >= 400:
            logger.error(
                "policy.audit_write_failed status=%s request_id=%s body=%.300s",
                resp.status_code,
                payload.get("metadata", {}).get("request_id"),
                resp.text,
            )
        else:
            logger.info(
                "policy.audit_write_ok status=%s request_id=%s action=%s enforced=%s",
                resp.status_code,
                payload.get("metadata", {}).get("request_id"),
                payload.get("metadata", {}).get("decided_action"),
                payload.get("metadata", {}).get("enforced"),
            )
    except Exception as exc:  # fire-and-forget — log, never propagate
        logger.error(
            "policy.audit_write_exception request_id=%s url=%s: %s",
            payload.get("metadata", {}).get("request_id"), target, exc,
        )


def emit_decision_record(record: Dict[str, Any]) -> None:
    """Default audit sink: fire-and-forget POST of one decision record.

    Schedules the write on the running event loop and returns immediately. If no
    loop is running (e.g. a synchronous unit-test calling ``decide`` without async
    context), the write is logged as skipped rather than blocking — tests that need
    to assert on writes inject their own sink.
    """
    payload = build_audit_payload(record)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning(
            "policy.audit_no_event_loop request_id=%s — decision not persisted via default sink",
            record.get("request_id"),
        )
        return
    task = loop.create_task(_post(payload))
    # Keep a reference until completion so the task is not garbage-collected.
    _INFLIGHT.add(task)
    task.add_done_callback(_INFLIGHT.discard)


# Strong references to in-flight fire-and-forget audit writes.
_INFLIGHT: "set[asyncio.Task]" = set()
