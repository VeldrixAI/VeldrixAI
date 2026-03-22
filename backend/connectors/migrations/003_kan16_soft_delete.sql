-- Migration: KAN-16 Report Deletion (Soft Delete Support)
-- Description: Add is_deleted field and indexes for efficient soft delete queries

-- Add is_deleted boolean field
ALTER TABLE trust_reports ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false NOT NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_trust_reports_user_created ON trust_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trust_reports_user_deleted ON trust_reports(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_trust_reports_deleted_at ON trust_reports(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update existing soft-deleted records to set is_deleted=true
UPDATE trust_reports SET is_deleted = true WHERE deleted_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN trust_reports.is_deleted IS 'Soft delete flag - true if report is deleted';
