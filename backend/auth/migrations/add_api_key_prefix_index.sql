-- Migration: add key_prefix column to api_keys for O(log n) lookup
-- Run once against your database before deploying the updated auth service.
--
-- Backfill note: existing rows will have key_prefix = '' (empty string).
-- Existing keys will still authenticate correctly via the fallback full-scan
-- path until they are rotated. New keys created after this migration will
-- have key_prefix populated automatically by the application.

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(16) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_api_keys_key_prefix
    ON api_keys (key_prefix)
    WHERE is_active = TRUE;
