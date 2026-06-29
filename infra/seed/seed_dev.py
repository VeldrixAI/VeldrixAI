#!/usr/bin/env python3
"""Minimal synthetic seed for the VeldrixAI DEV environment (Phase 5 §1.4).

WHAT: a handful of OBVIOUSLY-FAKE tenants/users, a couple of bundled example
policies (DEFAULT-SAFE 'shadow' bindings), and a modest set of synthetic audit
records — just enough that dashboards + chain-health panels render and the app
is navigable.

HARD RULES (Phase 5 §2):
  • SYNTHETIC ONLY. Zero prod-derived data. Emails end in `.test`/`.invalid`,
    UUIDs are derived from a fixed seed namespace — nothing here came from prod.
  • Audit rows are written THROUGH the real hash-chain path (_insert_with_chain),
    NEVER by bulk-INSERT that bypasses the `audit_trails_append_only` trigger.
    Seeding by violating our own immutability trigger would be self-defeating.
  • IDEMPOTENT / re-runnable: deterministic ids + per-row existence checks, so
    re-running resets dev to the same known state without forking the chain.

RUN (inside the connectors container, which has src/ + DATABASE_URL):
    docker compose -f docker-compose.deploy.yml exec veldrix-connectors \
        python /seed/seed_dev.py
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta

# The script is mounted at /seed; the connectors app lives at /app. Put /app on
# the path so `import src...` resolves to the real application modules (we reuse
# the app's own models + chain-insert path — no parallel write mechanism).
sys.path.insert(0, "/app")

from sqlalchemy import text  # noqa: E402

from src.db.base import SessionLocal  # noqa: E402
from src.modules.reports.models import AuditTrail  # noqa: E402
from src.modules.analytics.audit_controller import _insert_with_chain  # noqa: E402

# Fixed namespace so every id is deterministic + reproducible across re-runs.
_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "veldrix-dev-seed.invalid")


def _id(label: str) -> uuid.UUID:
    return uuid.uuid5(_NS, label)


# ── Obviously-fake tenants (emails end .test — never a real domain) ───────────
TENANTS = [
    {"key": "northwind", "email": "founder@northwind-demo.test", "name": "Northwind Demo Co"},
    {"key": "acme",      "email": "ops@acme-sandbox.test",       "name": "Acme Sandbox Ltd"},
    {"key": "globex",    "email": "trust@globex-fixture.test",   "name": "Globex Fixture Inc"},
]

# One bundled example policy per tenant; binding stays DEFAULT-SAFE 'shadow'.
EXAMPLE_POLICY = {
    "policy_id": "dev-baseline-policy",
    "version": 1,
    "default_action": "allow",
    "rules": [
        {"id": "no-pii-leak", "action": "mask", "match": "pii"},
        {"id": "block-toxicity", "action": "block", "match": "toxicity"},
    ],
}

# A modest spread of synthetic evaluation outcomes so the audit list + dashboards
# have something to show. All values are made up.
AUDIT_FIXTURES = [
    {"verdict": "allow", "overall": 0.96, "flags": []},
    {"verdict": "allow", "overall": 0.91, "flags": []},
    {"verdict": "disclaimer", "overall": 0.78, "flags": ["uncertain_claims_detected"]},
    {"verdict": "block", "overall": 0.42, "flags": ["toxicity", "policy_violation"]},
    {"verdict": "allow", "overall": 0.88, "flags": []},
]


def seed_users(db) -> None:
    print("Seeding synthetic tenants/users…")
    for t in TENANTS:
        uid = _id(f"user:{t['key']}")
        # hashed_password: a dummy non-login value (these accounts never authenticate).
        # role uses the 'userrole' PG enum that create_all() builds from UserRole —
        # SQLAlchemy stores the enum MEMBER NAME, so the valid label is 'USER'
        # (uppercase), NOT the lowercase value 'user' (the .sql baseline's label).
        # NOT-NULL columns whose defaults are PYTHON-side in the ORM (is_active,
        # created_at, updated_at, eval_count_month) get NO server DEFAULT from
        # create_all(), so a raw INSERT must supply them explicitly or hit a
        # not-null violation. (The seed runs in the connectors container, which has
        # no access to the auth User ORM model — hence raw SQL here.)
        db.execute(
            text(
                "INSERT INTO users (id, email, hashed_password, role, is_active, "
                "                   plan_tier, plan_status, eval_count_month, created_at, updated_at) "
                "VALUES (:id, :email, :pw, 'USER', true, 'scale', 'active', 0, NOW(), NOW()) "
                "ON CONFLICT (email) DO NOTHING"
            ),
            {"id": str(uid), "email": t["email"], "pw": "!seed-no-login!"},
        )
    db.commit()


def seed_policies(db) -> None:
    print("Seeding example policies + DEFAULT-SAFE shadow bindings…")
    import json
    for t in TENANTS:
        tenant_id = _id(f"user:{t['key']}")
        doc_id = _id(f"policy:{t['key']}")
        document = {
            "policy_id": EXAMPLE_POLICY["policy_id"],
            "version": EXAMPLE_POLICY["version"],
            "default_action": EXAMPLE_POLICY["default_action"],
            "rules": EXAMPLE_POLICY["rules"],
        }
        # policy_documents: immutable, versioned. ON CONFLICT on the (tenant,policy,
        # version) uniqueness keeps re-runs idempotent.
        db.execute(
            text(
                "INSERT INTO policy_documents "
                "  (id, tenant_id, policy_id, version, checksum, default_action, document, created_by) "
                "VALUES (:id, :tid, :pid, :ver, :chk, :act, CAST(:doc AS jsonb), :by) "
                "ON CONFLICT (tenant_id, policy_id, version) DO NOTHING"
            ),
            {
                "id": str(doc_id), "tid": str(tenant_id),
                "pid": EXAMPLE_POLICY["policy_id"], "ver": EXAMPLE_POLICY["version"],
                "chk": "sha256:dev-seed-fixture", "act": EXAMPLE_POLICY["default_action"],
                "doc": json.dumps(document), "by": "dev-seed",
            },
        )
        # policy_active_bindings: stays 'shadow' (default-safe) — dev must never
        # ship a fixture that silently gates traffic.
        db.execute(
            text(
                "INSERT INTO policy_active_bindings "
                "  (tenant_id, policy_id, pinned_version, policy_enforcement_mode) "
                "VALUES (:tid, :pid, :ver, 'shadow') "
                "ON CONFLICT (tenant_id, policy_id) DO NOTHING"
            ),
            {"tid": str(tenant_id), "pid": EXAMPLE_POLICY["policy_id"], "ver": EXAMPLE_POLICY["version"]},
        )
    db.commit()


def seed_audit(db) -> None:
    print("Seeding synthetic audit rows THROUGH the hash chain (trigger respected)…")
    inserted = skipped = 0
    base_ts = datetime.utcnow() - timedelta(days=2)

    for t in TENANTS:
        tenant_id = _id(f"user:{t['key']}")
        for i, fx in enumerate(AUDIT_FIXTURES):
            # Deterministic request_id => idempotent: a re-run skips rows already
            # present rather than appending and forking the per-tenant chain.
            request_id = f"seed-{t['key']}-{i:02d}"
            exists = db.query(AuditTrail).filter(
                AuditTrail.request_id == request_id,
                AuditTrail.action_type == "evaluation",
            ).first()
            if exists:
                skipped += 1
                continue

            meta = {
                "request_id": request_id,
                "verdict": fx["verdict"],
                "overall_score": fx["overall"],
                "model": "veldrix-dev-stub",
                "total_latency_ms": 120 + i * 7,
                "pillar_scores": {
                    "safety": round(min(1.0, fx["overall"] + 0.02), 3),
                    "hallucination": round(min(1.0, fx["overall"] + 0.01), 3),
                    "bias": round(min(1.0, fx["overall"] + 0.03), 3),
                    "prompt_security": round(min(1.0, fx["overall"]), 3),
                    "compliance": round(min(1.0, fx["overall"] + 0.015), 3),
                },
                "critical_flags": fx["flags"],
                "prompt_preview": f"[synthetic dev fixture #{i} for {t['name']}]",
                "response_preview": "[synthetic deterministic stub response]",
                "synthetic": True,  # explicit marker: never confuse with real data
            }
            entry = AuditTrail(
                user_id=tenant_id,
                action_type="evaluation",
                entity_type="trust_evaluation",
                entity_id=_id(f"eval:{t['key']}:{i}"),
                action_metadata=meta,
                log_type="EVALUATION",
                request_id=request_id,
                actor=t["email"],
                created_at=base_ts + timedelta(minutes=i * 11),
            )
            # THE chain path — INSERT only; the append-only trigger is untouched.
            _insert_with_chain(db, entry)
            inserted += 1

    print(f"  audit rows: inserted={inserted} skipped(existing)={skipped}")


def main() -> int:
    db = SessionLocal()
    try:
        seed_users(db)
        seed_policies(db)
        seed_audit(db)
    finally:
        db.close()
    print("✓ Synthetic dev seed complete (idempotent — safe to re-run).")
    print("  Verify chain health: infra/scripts/verify-dev.sh")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
