"""Enforcement-mode rollout service (Part B / B.3).

Makes the shadow→enforce transition a *safe, deliberate, reversible, audited*
operation — the highest-stakes action in the product. The decision verbs and pillar
scoring are never touched here; this only governs the per-tenant ``policy_enforcement_mode``
gate and the evidence trail around changing it.

Invariants:
  * **Audited.** Every change writes its own tamper-evident audit record through the
    Part A hash chain (who / when / from→to). Never a silent config edit.
  * **Default-safe.** A new/unconfigured tenant can only be created as ``shadow``;
    moving to ``enforce_critical_only`` / ``enforce`` requires an existing binding —
    enforcement is always an explicit opt-in. Recommended path:
    ``shadow → enforce_critical_only → enforce``.
  * **Instant, audited rollback.** ``enforce → shadow`` is a single request-time flag
    write (no deploy, no migration) and is itself audited.

The DB-bound functions delegate all decision logic to the pure helpers below so the
invariants are unit-testable without a database.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Mapping, Optional

from sqlalchemy.orm import Session

from src.modules.reports.models import AuditTrail
from src.modules.policy.models import PolicyActiveBinding


def _chain_insert(db: Session, entry: AuditTrail) -> AuditTrail:
    """Append one row to the Part A tamper-evident chain.

    Imported lazily so this rollout module does not pull the audit controller's
    request-layer dependencies (auth, etc.) at import time, and so tests can patch it.
    """
    from src.modules.analytics.audit_controller import _insert_with_chain

    return _insert_with_chain(db, entry)

logger = logging.getLogger("veldrix.policy.mode")

DEFAULT_MODE = "shadow"
VALID_MODES = ("shadow", "enforce", "enforce_critical_only")
GATING_ACTIONS = ("block", "escalate")

ACTION_CHANGE = "policy_enforcement_mode_change"
ACTION_ROLLBACK = "policy_enforcement_mode_rollback"


class ModeChangeError(ValueError):
    """Raised when a requested enforcement-mode change is invalid or unsafe."""


# ── Pure logic (DB-free, unit-tested directly) ───────────────────────────────────

def validate_transition(existing_mode: Optional[str], new_mode: str) -> None:
    """Enforce mode validity + the default-safe invariant.

    ``existing_mode is None`` means a new/unconfigured tenant. Such a tenant may only
    be created as ``shadow`` — enforcement is never the implicit first state.
    """
    if new_mode not in VALID_MODES:
        raise ModeChangeError(
            f"invalid enforcement mode {new_mode!r}; must be one of {VALID_MODES}"
        )
    if existing_mode is None and new_mode != DEFAULT_MODE:
        raise ModeChangeError(
            "default-safe invariant: a new/unconfigured tenant can only be set to "
            f"{DEFAULT_MODE!r}. Create the binding as shadow first, then opt in to "
            f"{new_mode!r} explicitly."
        )
    if existing_mode is not None and existing_mode not in VALID_MODES:
        raise ModeChangeError(f"stored mode {existing_mode!r} is not a valid mode")


def build_mode_change_metadata(
    *,
    tenant_id: str,
    policy_id: str,
    from_mode: str,
    to_mode: str,
    actor: str,
    reason: Optional[str],
    is_rollback: bool,
    change_id: str,
    changed_at: str,
) -> Dict[str, Any]:
    """The who/when/from→to payload committed to the audit chain. Counts/verbs only."""
    return {
        "change_id": change_id,
        "request_id": change_id,  # idempotency key for the connectors dedup
        "tenant_id": tenant_id,
        "policy_id": policy_id,
        "from_mode": from_mode,
        "to_mode": to_mode,
        "actor": actor,
        "reason": reason,
        "is_rollback": is_rollback,
        "changed_at": changed_at,
        "record_kind": "enforcement_mode_change",
    }


def compute_preflight(rows: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    """Blast-radius from a tenant's shadow-mode decision history.

    ``rows`` is an iterable of ``{"action": <verb>, "severity": <sev>}`` taken from the
    tenant's ``policy_decision`` audit records. Returns how many requests **enforce
    mode would have gated** (block/escalate), how many of those were critical, and a
    breakdown by verb — the numbers a customer sees before flipping the switch.
    """
    total = 0
    would_gate = 0
    would_gate_critical = 0
    by_action: Dict[str, int] = {}
    for r in rows:
        total += 1
        action = (r.get("action") or "unknown").lower()
        severity = (r.get("severity") or "").lower()
        by_action[action] = by_action.get(action, 0) + 1
        if action in GATING_ACTIONS:
            would_gate += 1
            if severity == "critical":
                would_gate_critical += 1
    return {
        "total_decisions": total,
        "would_gate": would_gate,
        "would_gate_critical": would_gate_critical,
        "would_gate_non_critical": would_gate - would_gate_critical,
        "by_action": by_action,
    }


# ── DB-bound operations ──────────────────────────────────────────────────────────

def get_mode(db: Session, tenant_id: str, policy_id: str) -> str:
    """Resolve a tenant's enforcement mode for ``policy_id`` (default ``shadow``)."""
    binding = (
        db.query(PolicyActiveBinding)
        .filter_by(tenant_id=tenant_id, policy_id=policy_id)
        .first()
    )
    return binding.policy_enforcement_mode if binding else DEFAULT_MODE


def change_mode(
    db: Session,
    *,
    tenant_id: str,
    policy_id: str,
    new_mode: str,
    actor: str,
    reason: Optional[str] = None,
    is_rollback: bool = False,
) -> Dict[str, Any]:
    """Change a tenant's enforcement mode and append the audit record. Validated + safe."""
    binding = (
        db.query(PolicyActiveBinding)
        .filter_by(tenant_id=tenant_id, policy_id=policy_id)
        .first()
    )
    existing_mode = binding.policy_enforcement_mode if binding else None
    validate_transition(existing_mode, new_mode)

    from_mode = existing_mode or DEFAULT_MODE  # effective prior mode for the record
    change_id = str(uuid.uuid4())
    changed_at = datetime.now(timezone.utc).isoformat()

    # Upsert the binding.
    if binding is not None:
        binding.policy_enforcement_mode = new_mode
    else:
        db.add(
            PolicyActiveBinding(
                tenant_id=tenant_id,
                policy_id=policy_id,
                policy_enforcement_mode=new_mode,
            )
        )

    # Append the tamper-evident audit record into the tenant's chain.
    meta = build_mode_change_metadata(
        tenant_id=tenant_id,
        policy_id=policy_id,
        from_mode=from_mode,
        to_mode=new_mode,
        actor=actor,
        reason=reason,
        is_rollback=is_rollback,
        change_id=change_id,
        changed_at=changed_at,
    )
    entry = AuditTrail(
        user_id=uuid.UUID(tenant_id),
        action_type=ACTION_ROLLBACK if is_rollback else ACTION_CHANGE,
        entity_type="policy_enforcement_mode",
        action_metadata=meta,
        log_type="GOVERNANCE",
        request_id=change_id,
        actor=actor,
    )
    _chain_insert(db, entry)

    logger.info(
        "policy.mode_change tenant=%s policy=%s %s→%s actor=%s rollback=%s change_id=%s",
        tenant_id, policy_id, from_mode, new_mode, actor, is_rollback, change_id,
    )
    return {
        "ok": True,
        "tenant_id": tenant_id,
        "policy_id": policy_id,
        "from_mode": from_mode,
        "to_mode": new_mode,
        "is_rollback": is_rollback,
        "change_id": change_id,
        "changed_at": changed_at,
    }


def rollback_to_shadow(
    db: Session, *, tenant_id: str, policy_id: str, actor: str, reason: Optional[str] = None
) -> Dict[str, Any]:
    """Immediately de-gate a tenant (→ shadow) and audit it. No deploy, no migration."""
    return change_mode(
        db,
        tenant_id=tenant_id,
        policy_id=policy_id,
        new_mode=DEFAULT_MODE,
        actor=actor,
        reason=reason or "rollback to shadow",
        is_rollback=True,
    )


def preflight_report(
    db: Session, *, tenant_id: str, policy_id: Optional[str], days: int = 7
) -> Dict[str, Any]:
    """Compute the enforce-mode blast radius from a tenant's recent shadow history."""
    from datetime import timedelta

    from sqlalchemy import text

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        text(
            "SELECT action_metadata->>'decided_action'   AS action, "
            "       action_metadata->>'decided_severity' AS severity "
            "FROM audit_trails "
            "WHERE action_type = 'policy_decision' "
            "  AND user_id = CAST(:tenant AS uuid) "
            "  AND (:pid IS NULL OR action_metadata->>'policy_id' = :pid) "
            "  AND created_at >= :since"
        ),
        {"tenant": tenant_id, "pid": policy_id, "since": since},
    ).mappings().all()

    report = compute_preflight(rows)
    report.update(
        {
            "tenant_id": tenant_id,
            "policy_id": policy_id,
            "window_days": days,
            "current_mode": get_mode(db, tenant_id, policy_id) if policy_id else None,
        }
    )
    return report
