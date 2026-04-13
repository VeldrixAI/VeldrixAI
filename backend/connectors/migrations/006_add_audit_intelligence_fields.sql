-- Migration 006: Add audit intelligence fields to audit_trails
-- Adds: log_type (discriminator), request_id (fast lookup index)
-- Safe to run on existing DBs — all steps are idempotent.

DO $$
BEGIN
    -- log_type: discriminates EVALUATION vs REPORT_CREATED vs REPORT_DELETED vs SYSTEM
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trails' AND column_name = 'log_type'
    ) THEN
        ALTER TABLE audit_trails ADD COLUMN log_type VARCHAR(50) NOT NULL DEFAULT 'EVALUATION';
    END IF;

    -- request_id: extracted from action_metadata for fast lookup without JSONB scan
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trails' AND column_name = 'request_id'
    ) THEN
        ALTER TABLE audit_trails ADD COLUMN request_id VARCHAR(100);
    END IF;

    -- related_request_id: for REPORT_CREATED/REPORT_DELETED — references source evaluation
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trails' AND column_name = 'related_request_id'
    ) THEN
        ALTER TABLE audit_trails ADD COLUMN related_request_id VARCHAR(100);
    END IF;

    -- actor: who triggered the action (user email or "system")
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trails' AND column_name = 'actor'
    ) THEN
        ALTER TABLE audit_trails ADD COLUMN actor VARCHAR(255);
    END IF;
END;
$$;

-- Backfill log_type for existing trust_evaluation rows
UPDATE audit_trails
SET log_type = 'EVALUATION'
WHERE action_type = 'trust_evaluation' AND log_type = 'EVALUATION';

-- Backfill request_id from action_metadata JSONB for existing rows
UPDATE audit_trails
SET request_id = action_metadata->>'request_id'
WHERE request_id IS NULL
  AND action_metadata IS NOT NULL
  AND action_metadata->>'request_id' IS NOT NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_audit_trails_log_type      ON audit_trails (log_type);
CREATE INDEX IF NOT EXISTS idx_audit_trails_request_id    ON audit_trails (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_trails_actor         ON audit_trails (actor);
CREATE INDEX IF NOT EXISTS idx_audit_trails_related_req   ON audit_trails (related_request_id);
