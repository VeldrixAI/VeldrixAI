-- ============================================================================
-- Migration 009: Policy Engine storage  (ADDITIVE — NOT YET APPLIED)
-- ============================================================================
--
--   ⚠️  REVIEW BEFORE APPLYING. This migration is intentionally NOT run by the
--       Phase 1 PR. It is generated for human review per the Policy Engine spec
--       (§3 "additive, reviewable migration … STOP for human review before
--       applying") and the Absolute Constraint against destructive migrations.
--
-- What it adds (all additive; no existing table is altered destructively, no data
-- is deleted, every statement is IF NOT EXISTS / idempotent):
--
--   1. policy_documents          — immutable, versioned policy documents per tenant.
--   2. policy_active_bindings     — which (policy_id, version) is active per tenant,
--                                   plus the per-tenant enforcement mode (§2.8),
--                                   DEFAULT 'shadow' so a fresh tenant cannot gate.
--
-- Tenancy: there is no tenant/org table in this system (RECON §7b); user_id (UUID)
-- is the de-facto tenant key. tenant_id below == users.id. We deliberately do NOT
-- add columns to auth.users (keeps the engine self-contained; avoids the auth
-- surface, per Absolute Constraints).
--
-- Note on immutability: policy_documents is treated as append-only by convention
-- (a change = a new version row), consistent with how audit_trails is handled in
-- this codebase (migration 008 note). No UPDATE/DELETE trigger guard is added here
-- because none exists elsewhere in this schema; if DB-enforced immutability is
-- desired it should be a separate, explicitly-reviewed change.
-- ============================================================================

BEGIN;

-- ── 1. Versioned, immutable policy documents ────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL,                 -- == users.id (de-facto tenant key)
    policy_id       VARCHAR(128) NOT NULL,         -- stable id across versions
    version         INTEGER NOT NULL,              -- monotonic; a change = a new row
    checksum        VARCHAR(80) NOT NULL,          -- "sha256:<hex>" of canonical rules
    default_action  VARCHAR(20) NOT NULL,          -- allow|block|rewrite|mask|disclaimer|escalate|regenerate
    document        JSONB NOT NULL,                -- full serialized Policy (rules, etc.)
    created_by      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    effective_at    TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_policy_default_action CHECK (
        default_action IN ('allow','block','rewrite','mask','disclaimer','escalate','regenerate')
    ),
    -- A (tenant, policy, version) triple is unique and, once written, immutable.
    CONSTRAINT uq_policy_tenant_id_version UNIQUE (tenant_id, policy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_documents_tenant      ON policy_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_documents_lookup      ON policy_documents (tenant_id, policy_id, version);
CREATE INDEX IF NOT EXISTS idx_policy_documents_effective   ON policy_documents (tenant_id, policy_id, effective_at);

COMMENT ON TABLE policy_documents IS
    'Immutable, versioned Policy Engine documents. A change creates a new version row; rows are never mutated in place.';

-- ── 2. Per-tenant active binding + enforcement mode (§2.8) ──────────────────
CREATE TABLE IF NOT EXISTS policy_active_bindings (
    tenant_id               UUID NOT NULL,
    policy_id               VARCHAR(128) NOT NULL,
    -- The version this tenant is pinned to (enterprise change-control). NULL means
    -- "resolve latest effective_at <= now" at request time.
    pinned_version          INTEGER,
    -- §2.8 — DEFAULT 'shadow' for every tenant. Enforcement is strictly opt-in:
    -- a fresh binding cannot gate production traffic until this is changed.
    policy_enforcement_mode VARCHAR(32) NOT NULL DEFAULT 'shadow',
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_policy_active_bindings PRIMARY KEY (tenant_id, policy_id),
    CONSTRAINT ck_policy_enforcement_mode CHECK (
        policy_enforcement_mode IN ('shadow','enforce','enforce_critical_only')
    )
);

CREATE INDEX IF NOT EXISTS idx_policy_active_bindings_tenant ON policy_active_bindings (tenant_id);

COMMENT ON COLUMN policy_active_bindings.policy_enforcement_mode IS
    'Per-tenant gating mode (§2.8). Default shadow: engine evaluates + records but gates nothing until explicitly set to enforce / enforce_critical_only.';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual; for reviewer reference — not executed):
--   DROP TABLE IF EXISTS policy_active_bindings;
--   DROP TABLE IF EXISTS policy_documents;
-- ============================================================================
