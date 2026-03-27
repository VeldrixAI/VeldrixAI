-- Migration 006: Add timezone-aware timestamp fields to audit_trails
-- Additive only — no destructive changes. Safe to run on a live database.
-- Added: 2026-03-26

ALTER TABLE audit_trails
    ADD COLUMN IF NOT EXISTS logged_at_utc   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_timezone   VARCHAR(64) NOT NULL DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS logged_at_local VARCHAR(32);

-- Back-fill existing rows: derive logged_at_utc from created_at (which was stored without tz)
UPDATE audit_trails
SET logged_at_utc = created_at AT TIME ZONE 'UTC'
WHERE logged_at_utc IS NULL;

-- Index for timezone-aware range queries
CREATE INDEX IF NOT EXISTS idx_audit_trails_logged_at_utc ON audit_trails (logged_at_utc);
