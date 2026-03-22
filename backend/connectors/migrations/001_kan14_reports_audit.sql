-- Migration: KAN-14 Reports & Audit Data Models
-- Created: 2024
-- Description: Trust Reports, Audit Trail, and Deletion Log tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUM Types
CREATE TYPE report_status AS ENUM ('generating', 'completed', 'failed');
CREATE TYPE report_type AS ENUM ('compliance', 'risk', 'bias', 'model_eval');
CREATE TYPE action_type AS ENUM ('CREATE_REPORT', 'DELETE_REPORT', 'LOGIN', 'LOGOUT', 'CREATE_API_KEY', 'REVOKE_API_KEY', 'TRUST_EVALUATION');

-- Trust Reports Table
CREATE TABLE trust_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    description TEXT,
    report_type report_type NOT NULL,
    status report_status DEFAULT 'generating',
    input_payload JSONB,
    output_summary TEXT,
    output_full_report JSONB,
    storage_path TEXT,
    checksum_hash TEXT,
    version INT DEFAULT 1,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for trust_reports
CREATE INDEX idx_trust_reports_user_id ON trust_reports(user_id);
CREATE INDEX idx_trust_reports_status ON trust_reports(status);
CREATE INDEX idx_trust_reports_created_at ON trust_reports(created_at);
CREATE INDEX idx_trust_reports_deleted_at ON trust_reports(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_trust_reports_type ON trust_reports(report_type);

-- Audit Trail Table
CREATE TABLE audit_trails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type action_type NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit_trails
CREATE INDEX idx_audit_trails_user_id ON audit_trails(user_id);
CREATE INDEX idx_audit_trails_action_type ON audit_trails(action_type);
CREATE INDEX idx_audit_trails_created_at ON audit_trails(created_at);
CREATE INDEX idx_audit_trails_entity ON audit_trails(entity_type, entity_id);

-- Deletion Log Table
CREATE TABLE deletion_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    deletion_type VARCHAR(20) CHECK (deletion_type IN ('soft', 'hard')),
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for deletion_logs
CREATE INDEX idx_deletion_logs_report_id ON deletion_logs(report_id);
CREATE INDEX idx_deletion_logs_user_id ON deletion_logs(user_id);
CREATE INDEX idx_deletion_logs_created_at ON deletion_logs(created_at);

-- Trigger for updated_at on trust_reports
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trust_reports_updated_at BEFORE UPDATE ON trust_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE trust_reports IS 'Stores AI trust evaluation reports with versioning and soft delete support';
COMMENT ON TABLE audit_trails IS 'Comprehensive audit log for all system actions';
COMMENT ON TABLE deletion_logs IS 'Tracks all report deletions for compliance and recovery';
