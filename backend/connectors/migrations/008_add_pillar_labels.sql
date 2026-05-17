-- ============================================================================
-- Migration 008 — audit_log_labels
-- Per-pillar ground truth labeling table for accuracy metric computation.
-- Linked to audit_trails by request_id (never modifies audit_trails rows).
-- Append-only from the SDK/human-review perspective; upsert on conflict is
-- allowed because a label revision supersedes the prior label — the label
-- itself is not the immutable record, the evaluation is.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log_labels (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id          VARCHAR(100)  NOT NULL,
    pillar_name         VARCHAR(50)   NOT NULL,
    predicted_label     BOOLEAN       NOT NULL,
    predicted_confidence FLOAT        NOT NULL,
    ground_truth_label  BOOLEAN,
    label_source        VARCHAR(50),
    labeled_at          TIMESTAMP,
    pillar_latency_ms   INTEGER,
    user_id             UUID,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_label_per_request_pillar UNIQUE (request_id, pillar_name)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_labels_request_id  ON audit_log_labels (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_labels_user_id     ON audit_log_labels (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_labels_pillar      ON audit_log_labels (pillar_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_labels_created_at  ON audit_log_labels (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_labels_labeled     ON audit_log_labels (user_id, pillar_name, created_at)
    WHERE ground_truth_label IS NOT NULL;

COMMENT ON TABLE audit_log_labels IS
    'Per-pillar ground truth labels for accuracy metric computation. '
    'Linked to audit_trails.request_id. Never updates audit_trails rows.';
