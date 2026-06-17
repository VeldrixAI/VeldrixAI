-- ============================================================================
-- Migration 011: Enforcement-mode rollout store  (ADDITIVE — reviewable artifact)
-- ============================================================================
--
--   Part B / B.3. Provides the per-tenant enforcement-mode binding the rollout
--   tooling reads and writes (audited mode-change, pre-flight blast-radius report,
--   staged enablement, instant rollback). The core service reads this mode at
--   request time via src/policy/mode_client.py (cached, fail-safe to 'shadow').
--
--   How this is applied (the connectors reality, established in Part A): connectors
--   has NO SQL-file migration runner. Schema comes from SQLAlchemy
--   `Base.metadata.create_all()` on boot, which creates *missing tables* (but never
--   alters existing tables / triggers). The `PolicyActiveBinding` model
--   (src/modules/policy/models.py) is registered before create_all(), so this table
--   — including the CHECK constraint and the DEFAULT 'shadow' — is materialized
--   idempotently on every boot. This .sql file is the canonical, human-readable
--   form for review and for any operator applying it by hand (psql -f).
--
--   This is the SAME table Phase 1's generated-but-never-applied 009 defined; 011
--   is idempotent (IF NOT EXISTS) and safe to run whether or not 009 ever ran.
--
--   DEFAULT-SAFE INVARIANT (§ "Default-safe"): every binding defaults to 'shadow'
--   and the CHECK constraint bounds the column to the three valid modes. The tooling
--   additionally refuses to *create* a new/unconfigured tenant in any mode but
--   'shadow' — enforcement is always an explicit, deliberate opt-in.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS policy_active_bindings (
    tenant_id               UUID NOT NULL,                 -- == users.id (de-facto tenant key)
    policy_id               VARCHAR(128) NOT NULL,
    pinned_version          INTEGER,                       -- NULL → resolve latest effective at request time
    policy_enforcement_mode VARCHAR(32) NOT NULL DEFAULT 'shadow',
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_policy_active_bindings PRIMARY KEY (tenant_id, policy_id),
    CONSTRAINT ck_policy_enforcement_mode CHECK (
        policy_enforcement_mode IN ('shadow','enforce','enforce_critical_only')
    )
);

CREATE INDEX IF NOT EXISTS idx_policy_active_bindings_tenant ON policy_active_bindings (tenant_id);

COMMENT ON COLUMN policy_active_bindings.policy_enforcement_mode IS
    'Per-tenant gating mode (§2.8). Default shadow: the engine evaluates + records but '
    'gates nothing until explicitly set to enforce / enforce_critical_only. Every change '
    'is written as a tamper-evident audit record (action_type policy_enforcement_mode_change).';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual; reviewer reference — not executed):
--   DROP TABLE IF EXISTS policy_active_bindings;
-- ============================================================================
