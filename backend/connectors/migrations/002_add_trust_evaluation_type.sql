-- Add trust_evaluation to report_type enum
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'trust_evaluation';
