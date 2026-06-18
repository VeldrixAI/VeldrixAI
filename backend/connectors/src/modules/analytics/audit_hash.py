"""Tamper-evident hash chain for the ``audit_trails`` table (Phase 2 / Part A).

Every audit row carries a ``record_hash`` derived from the row's immutable
identity **and** the ``record_hash`` of the previous row *in the same tenant's
chain*. Any after-the-fact edit to a row — or a deletion that removes a link —
breaks every downstream hash, so the tampering is detectable offline from the
rows alone.

Canonical serializer — byte-for-byte parity with core
-----------------------------------------------------
The Policy Engine in the core service already pins a canonical hashing recipe
(``backend/core/src/policy/schema.py`` :: ``Policy._compute_checksum``)::

    blob = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()

Core and connectors are **separate deployables** and do not import one another,
so per the Part-A recon (N1) we *duplicate* that exact recipe here rather than
introduce a cross-service import. ``test_audit_hash.py`` asserts byte-for-byte
parity against a re-derivation of the core recipe and against pinned vectors —
if either service ever drifts, that test fails.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Optional

# ── Sentinels ────────────────────────────────────────────────────────────────

# Genesis link: the prev_hash of the first record in any tenant's chain. A fixed,
# documented value so a verifier can recompute the head without special-casing.
GENESIS_HASH = "sha256:" + "0" * 64

# Many audit rows are system/internal writes with user_id IS NULL. A per-tenant
# chain needs a deterministic key for those rows, so they share one reserved
# "system tenant" chain under the all-zeros UUID.
SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000"


# ── Canonical serializer (duplicated from core; see module docstring) ────────

def canonical_json(obj: Any) -> str:
    """Ordering-stable, whitespace-free JSON. Byte-for-byte identical recipe to core.

    No ``default=`` fallback: a non-JSON-native value (e.g. ``Decimal``) RAISES
    ``TypeError`` rather than being silently stringified. Stringifying let two
    distinct payloads collide to the same canonical form and broke parity with core
    (which also raises) — see F-CANON-1.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def _sha256_prefixed(blob: str) -> str:
    return "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ── Record hashing ───────────────────────────────────────────────────────────

def canonical_identity(
    *,
    action_type: Optional[str],
    entity_type: Optional[str],
    entity_id: Any,
    user_id: Any,
    request_id: Optional[str],
    created_at: Any,
    action_metadata: Optional[Mapping[str, Any]],
) -> dict:
    """The immutable identity of an audit row that the hash commits to.

    Every field a tamperer might want to alter is covered — not just the
    metadata payload — so editing *any* of them invalidates ``record_hash``.
    ``created_at`` is serialized via ``.isoformat()`` when available so the
    preimage is reproducible from the stored row.
    """
    ca = created_at.isoformat() if hasattr(created_at, "isoformat") else (
        None if created_at is None else str(created_at)
    )
    return {
        "action_type": action_type,
        "entity_type": entity_type,
        "entity_id": None if entity_id is None else str(entity_id),
        "user_id": None if user_id is None else str(user_id),
        "request_id": request_id,
        "created_at": ca,
        "action_metadata": action_metadata or {},
    }


def compute_record_hash(*, prev_hash: str, **identity: Any) -> str:
    """``sha256( canonical(identity) || "\\n" || prev_hash )``.

    The previous record's hash is folded in so each link depends on the entire
    history before it. ``identity`` accepts the same keyword fields as
    :func:`canonical_identity`.
    """
    ident = canonical_identity(**identity)
    preimage = canonical_json(ident) + "\n" + (prev_hash or GENESIS_HASH)
    return _sha256_prefixed(preimage)


def tenant_key(user_id: Any) -> str:
    """The chain a row belongs to: its user_id, or the system tenant for NULL."""
    return str(user_id) if user_id else SYSTEM_TENANT_ID


# ── Verification (ops + tests) ───────────────────────────────────────────────

def verify_chain(rows: list[Mapping[str, Any]]) -> Optional[str]:
    """Verify one tenant's chain, given rows ordered by ``chain_seq`` ascending.

    Returns ``None`` if the chain is intact, otherwise a human-readable string
    describing the first broken link. Each row mapping must expose the identity
    fields plus ``prev_hash`` and ``record_hash``.
    """
    expected_prev = GENESIS_HASH
    for i, row in enumerate(rows):
        if (row.get("prev_hash") or GENESIS_HASH) != expected_prev:
            return (
                f"chain break at seq {row.get('chain_seq', i)}: prev_hash "
                f"{row.get('prev_hash')!r} != expected {expected_prev!r}"
            )
        recomputed = compute_record_hash(
            prev_hash=expected_prev,
            action_type=row.get("action_type"),
            entity_type=row.get("entity_type"),
            entity_id=row.get("entity_id"),
            user_id=row.get("user_id"),
            request_id=row.get("request_id"),
            created_at=row.get("created_at"),
            action_metadata=row.get("action_metadata"),
        )
        if recomputed != row.get("record_hash"):
            return (
                f"tampered row at seq {row.get('chain_seq', i)}: stored hash "
                f"{row.get('record_hash')!r} != recomputed {recomputed!r}"
            )
        expected_prev = recomputed
    return None
