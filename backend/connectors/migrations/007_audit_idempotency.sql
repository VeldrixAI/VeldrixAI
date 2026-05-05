-- Migration 007: Audit log idempotency
-- Adds a partial unique index on (request_id, action_type) WHERE request_id IS NOT NULL.
-- Rows without a request_id (pre-006 legacy rows) are unaffected — PostgreSQL treats
-- NULLs as distinct in unique indexes, so they are not constrained.
-- Safe to run on existing DBs — all steps are idempotent.

BEGIN;

-- Step 1: Remove duplicate rows, keeping the earliest-created row per (request_id, action_type).
-- This makes the subsequent unique index creation safe on existing data.
DELETE FROM audit_trails
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY request_id, action_type
                   ORDER BY created_at ASC
               ) AS rn
        FROM audit_trails
        WHERE request_id IS NOT NULL
    ) t
    WHERE rn > 1
);

COMMIT;

-- Step 2: Create partial unique index (outside transaction — safe for existing data).
-- Using IF NOT EXISTS makes this idempotent across re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_request_action
    ON audit_trails (request_id, action_type)
    WHERE request_id IS NOT NULL;
