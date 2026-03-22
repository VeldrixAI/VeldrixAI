-- Migration 005: Add report_name and vx_report_id to trust_reports
-- Safe to run even if trust_reports was just created by migration 001.
-- Uses DO blocks so each step only fires when the table/column exists.

DO $$
BEGIN
    -- report_name: premium RunPod-style name, e.g. "Cobalt Nexus"
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trust_reports' AND column_name = 'report_name'
    ) THEN
        ALTER TABLE trust_reports ADD COLUMN report_name VARCHAR(100);
    END IF;

    -- vx_report_id: short sortable ID, e.g. "VX-20260310-A1B2"
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trust_reports' AND column_name = 'vx_report_id'
    ) THEN
        ALTER TABLE trust_reports ADD COLUMN vx_report_id VARCHAR(30);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_trust_reports_report_name  ON trust_reports (report_name);
CREATE INDEX IF NOT EXISTS ix_trust_reports_vx_report_id ON trust_reports (vx_report_id);
