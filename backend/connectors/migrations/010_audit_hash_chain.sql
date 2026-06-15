-- ============================================================================
-- Migration 010: Audit trail hash chain + append-only enforcement
--                (Phase 2 / Part A — Audit Substrate Hardening)
-- ============================================================================
--
-- Canonical, human-readable form of the migration that backend/connectors/
-- src/main.py::_run_migrations applies idempotently on every boot. (This repo
-- has no SQL-file runner for connectors — schema comes from SQLAlchemy
-- create_all() plus the startup hook — so THIS FILE is the reviewable record,
-- not the execution path. Keep the two in sync.)
--
-- What it does (all additive except the deliberate removal of mutability):
--   1. Adds prev_hash, record_hash, chain_seq columns to audit_trails.
--   2. Backfills the per-tenant hash chain for existing rows — BEFORE the
--      append-only trigger exists (the trigger would block these UPDATEs).
--   3. Creates a BEFORE UPDATE OR DELETE trigger that makes audit_trails
--      append-only at the DB layer, even against direct SQL.
--
-- Hash recipe (must match src/modules/analytics/audit_hash.py byte-for-byte):
--   record_hash = "sha256:" + sha256( canonical_json(identity) || "\n" || prev_hash )
--   where canonical_json = json.dumps(obj, sort_keys=True, separators=(",",":"))
--   and identity = {action_type, entity_type, entity_id, user_id, request_id,
--                   created_at(isoformat), action_metadata}.
--   Genesis prev_hash = "sha256:" + repeat('0', 64).
--   Tenant chain key = user_id, or the all-zeros UUID for system (NULL) rows.
--
-- NOTE: the chain backfill is computed in Python (the hash recipe lives there);
-- this SQL documents the column/trigger DDL. Apply the Python hook to populate
-- hashes, or port the recipe to plpgsql if a pure-SQL apply is ever required.
-- ============================================================================

BEGIN;

-- ── 1. Additive chain columns ───────────────────────────────────────────────
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS prev_hash   VARCHAR(80);
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS record_hash VARCHAR(80);
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS chain_seq   BIGINT;

CREATE INDEX IF NOT EXISTS idx_audit_trails_record_hash ON audit_trails (record_hash);

-- ── 2. Backfill: run the Python startup hook (_run_migrations) here. ─────────
--     It walks each tenant's rows by (created_at, id), chaining from genesis,
--     and must execute while NO append-only trigger exists.

-- ── 3. Append-only enforcement trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_trails_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_trails is append-only; UPDATE and DELETE are not permitted'
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_trails_append_only ON audit_trails;
CREATE TRIGGER audit_trails_append_only
    BEFORE UPDATE OR DELETE ON audit_trails
    FOR EACH ROW EXECUTE FUNCTION audit_trails_block_mutation();

COMMENT ON TRIGGER audit_trails_append_only ON audit_trails IS
    'Part A: audit_trails is append-only. Any legitimate future schema migration '
    'that must touch rows has to DROP this trigger, migrate, then recreate it — '
    'an explicit, separately-reviewed step.';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual; reviewer reference — not executed):
--   DROP TRIGGER IF EXISTS audit_trails_append_only ON audit_trails;
--   DROP FUNCTION IF EXISTS audit_trails_block_mutation();
--   ALTER TABLE audit_trails DROP COLUMN IF EXISTS chain_seq;
--   ALTER TABLE audit_trails DROP COLUMN IF EXISTS record_hash;
--   ALTER TABLE audit_trails DROP COLUMN IF EXISTS prev_hash;
-- ============================================================================
