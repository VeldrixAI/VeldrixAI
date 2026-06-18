"""Domain 3.4 — Audit Chain: concurrent chain-fork race under true parallelism.
[NIST AI RMF MANAGE / tamper-evidence completeness]

Closes the Phase-3 "Not reached" gap: the DB-level suite proved single-writer chain
integrity but NOT the concurrent-head race (audit_controller.py:238, the per-tenant
``pg_advisory_xact_lock``). If two writers can read the same chain head before either
commits, they fork the chain — two records claim the same ``prev_hash`` / ``chain_seq``
— and tamper-evidence *completeness* is defeated (a forged branch is indistinguishable
from the real one). There is NO DB unique constraint on (user_id, chain_seq); the
advisory lock is the sole serializer, so this must be exercised under real concurrency.

Harness: N threads, each with its OWN connection, all released simultaneously by a
barrier, insert into the SAME tenant's chain via the real ``_insert_with_chain``.

Result: HELD — the advisory lock serializes; every record gets a unique, contiguous
``chain_seq`` and a unique ``prev_hash``, the linkage is a single unbroken chain, and
``verify_chain`` passes. (A fork would surface as a duplicate seq/parent → assertion
failure → a High; see EDGE_FINDINGS.md.)

Ephemeral Postgres only (conftest.adv_engine); skips if unavailable.
"""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from src.modules.analytics.audit_hash import GENESIS_HASH, verify_chain


def _insert_one(engine, tenant_id: str, i: int, barrier: threading.Barrier) -> None:
    from src.modules.analytics.audit_controller import _insert_with_chain
    from src.modules.reports.models import AuditTrail

    # Build the row, then release all threads at once so they contend on the head.
    entry = AuditTrail(
        id=uuid.uuid4(),
        user_id=uuid.UUID(tenant_id),
        action_type="policy_decision",
        action_metadata={"i": i},
        request_id=f"req-{i}",
        log_type="EVALUATION",
    )
    barrier.wait()
    with Session(engine) as db:
        _insert_with_chain(db, entry)


@pytest.mark.parametrize("n", [16])
def test_concurrent_inserts_do_not_fork_the_chain(adv_engine, n):
    tenant = str(uuid.uuid4())

    # A dedicated engine with a pool large enough that N writers can hold connections
    # simultaneously — so the only thing serializing them is the advisory lock, not the
    # pool. (adv_engine already created the fresh table + append-only trigger.)
    eng = create_engine(adv_engine.url.render_as_string(hide_password=False), pool_size=n + 2, max_overflow=0)
    try:
        barrier = threading.Barrier(n)
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = [pool.submit(_insert_one, eng, tenant, i, barrier) for i in range(n)]
            for f in futures:
                f.result()  # re-raise any worker exception
    finally:
        eng.dispose()

    with Session(adv_engine) as db:
        rows = db.execute(
            text(
                "SELECT action_type, entity_type, entity_id, user_id, request_id, "
                "       created_at, action_metadata, prev_hash, record_hash, chain_seq "
                "FROM audit_trails WHERE user_id = CAST(:t AS uuid) "
                "ORDER BY chain_seq ASC"
            ),
            {"t": tenant},
        ).mappings().all()

    assert len(rows) == n, "every concurrent insert must persist exactly one row"

    # 1. chain_seq is unique AND contiguous 0..n-1 (a fork would dup a seq or leave a gap).
    seqs = [r["chain_seq"] for r in rows]
    assert seqs == list(range(n)), f"chain_seq not unique/contiguous: {seqs}"

    # 2. No two records share a parent (prev_hash) — the defining property of "no fork".
    prevs = [r["prev_hash"] for r in rows]
    assert len(set(prevs)) == n, "two records share a prev_hash → the chain forked"

    # 3. Linkage is a single unbroken chain: each prev_hash == the prior record_hash.
    expected_prev = GENESIS_HASH
    for r in rows:
        assert r["prev_hash"] == expected_prev, "prev_hash does not link to the prior head"
        expected_prev = r["record_hash"]

    # 4. record_hash values are all distinct (no two identical links).
    assert len({r["record_hash"] for r in rows}) == n

    # 5. The authoritative end-to-end verifier passes on the concurrently-built chain.
    assert verify_chain([dict(r) for r in rows]) is None


def test_advisory_lock_actually_serializes_distinct_tenants_independently(adv_engine):
    """Control: two DIFFERENT tenants are independent chains — concurrency across
    tenants must not cross-link or interfere (each gets its own genesis-rooted chain)."""
    t1, t2 = str(uuid.uuid4()), str(uuid.uuid4())
    n = 8
    eng = create_engine(adv_engine.url.render_as_string(hide_password=False), pool_size=2 * n + 2, max_overflow=0)
    try:
        barrier = threading.Barrier(2 * n)
        with ThreadPoolExecutor(max_workers=2 * n) as pool:
            futs = []
            for i in range(n):
                futs.append(pool.submit(_insert_one, eng, t1, i, barrier))
                futs.append(pool.submit(_insert_one, eng, t2, i, barrier))
            for f in futs:
                f.result()
    finally:
        eng.dispose()

    for tenant in (t1, t2):
        with Session(adv_engine) as db:
            rows = db.execute(
                text(
                    "SELECT action_type, entity_type, entity_id, user_id, request_id, "
                    "       created_at, action_metadata, prev_hash, record_hash, chain_seq "
                    "FROM audit_trails WHERE user_id = CAST(:t AS uuid) ORDER BY chain_seq ASC"
                ),
                {"t": tenant},
            ).mappings().all()
        assert [r["chain_seq"] for r in rows] == list(range(n))
        assert verify_chain([dict(r) for r in rows]) is None
