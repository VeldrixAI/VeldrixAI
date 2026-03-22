-- ============================================================================
-- VeldrixAI Full Schema — run this on a completely fresh database.
-- Creates ALL tables (auth + connectors) in dependency order.
-- Every statement is idempotent: safe to run more than once.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS (auth service) ─────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'developer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR NOT NULL UNIQUE,
    hashed_password     VARCHAR NOT NULL,
    role                user_role NOT NULL DEFAULT 'user',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    stripe_customer_id  VARCHAR UNIQUE,
    subscription_id     VARCHAR UNIQUE,
    plan_tier           VARCHAR NOT NULL DEFAULT 'free',
    plan_status         VARCHAR NOT NULL DEFAULT 'active',
    eval_count_month    INTEGER NOT NULL DEFAULT 0,
    billing_period_end  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_users_email              ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_stripe_customer_id ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS ix_users_subscription_id    ON users (subscription_id);

-- Backfill billing columns on older DBs that only ran the base users table
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='plan_tier') THEN
        ALTER TABLE users
            ADD COLUMN stripe_customer_id VARCHAR UNIQUE,
            ADD COLUMN subscription_id     VARCHAR UNIQUE,
            ADD COLUMN plan_tier           VARCHAR NOT NULL DEFAULT 'free',
            ADD COLUMN plan_status         VARCHAR NOT NULL DEFAULT 'active',
            ADD COLUMN eval_count_month    INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN billing_period_end  TIMESTAMP;
    END IF;
END; $$;

-- ── API KEYS (auth service) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash     VARCHAR NOT NULL UNIQUE,
    name         VARCHAR,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_api_keys_user_id  ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS ix_api_keys_key_hash ON api_keys (key_hash);

-- ── REPORT ENUM TYPES (connectors) ───────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE report_status AS ENUM ('generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
    CREATE TYPE report_type AS ENUM (
        'compliance', 'risk', 'bias', 'model_eval', 'trust_evaluation'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
    ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'trust_evaluation';
EXCEPTION WHEN others THEN NULL; END; $$;

DO $$ BEGIN
    CREATE TYPE action_type AS ENUM (
        'CREATE_REPORT', 'DELETE_REPORT', 'LOGIN', 'LOGOUT',
        'CREATE_API_KEY', 'REVOKE_API_KEY', 'TRUST_EVALUATION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── TRUST REPORTS (connectors) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trust_reports (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_name        VARCHAR(100),
    vx_report_id       VARCHAR(30),
    title              VARCHAR(255),
    description        TEXT,
    report_type        VARCHAR(50) NOT NULL,
    status             VARCHAR(20) DEFAULT 'generating',
    input_payload      JSONB,
    output_summary     TEXT,
    output_full_report JSONB,
    storage_path       TEXT,
    checksum_hash      TEXT,
    version            INT DEFAULT 1,
    is_deleted         BOOLEAN DEFAULT false NOT NULL,
    deleted_at         TIMESTAMP,
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

-- Backfill columns for older DBs that ran earlier migrations piecemeal
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='trust_reports' AND column_name='is_deleted') THEN
        ALTER TABLE trust_reports ADD COLUMN is_deleted BOOLEAN DEFAULT false NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='trust_reports' AND column_name='output_full_report') THEN
        ALTER TABLE trust_reports ADD COLUMN output_full_report JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='trust_reports' AND column_name='report_name') THEN
        ALTER TABLE trust_reports ADD COLUMN report_name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='trust_reports' AND column_name='vx_report_id') THEN
        ALTER TABLE trust_reports ADD COLUMN vx_report_id VARCHAR(30);
    END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_trust_reports_user_id      ON trust_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_trust_reports_status       ON trust_reports (status);
CREATE INDEX IF NOT EXISTS idx_trust_reports_created_at   ON trust_reports (created_at);
CREATE INDEX IF NOT EXISTS idx_trust_reports_type         ON trust_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_trust_reports_user_created ON trust_reports (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trust_reports_user_deleted ON trust_reports (user_id, is_deleted);
CREATE INDEX IF NOT EXISTS ix_trust_reports_report_name   ON trust_reports (report_name);
CREATE INDEX IF NOT EXISTS ix_trust_reports_vx_report_id  ON trust_reports (vx_report_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_trust_reports_updated_at ON trust_reports;
CREATE TRIGGER update_trust_reports_updated_at
    BEFORE UPDATE ON trust_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── AUDIT TRAILS (connectors) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_trails (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type     VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(100),
    entity_id       UUID,
    action_metadata JSONB,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trails_user_id     ON audit_trails (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trails_action_type ON audit_trails (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_trails_created_at  ON audit_trails (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trails_entity      ON audit_trails (entity_type, entity_id);

-- ── DELETION LOGS (connectors) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deletion_logs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id         UUID,
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    deletion_type     VARCHAR(20) CHECK (deletion_type IN ('soft', 'hard')),
    reason            TEXT,
    deletion_metadata JSONB,
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_logs_report_id  ON deletion_logs (report_id);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_user_id    ON deletion_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_created_at ON deletion_logs (created_at);

-- ── SAVED PROMPTS (connectors) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    name        VARCHAR(255) NOT NULL,
    variant     VARCHAR(20) NOT NULL CHECK (variant IN ('Strict', 'Balanced', 'Adaptive')),
    prompt_text TEXT NOT NULL,
    config_json JSONB,
    industry    VARCHAR(100),
    region      VARCHAR(20),
    strictness  INTEGER DEFAULT 3 CHECK (strictness BETWEEN 1 AND 5),
    keywords    TEXT,
    is_deleted  BOOLEAN DEFAULT false NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_id      ON saved_prompts (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_created ON saved_prompts (user_id, created_at DESC);

-- ── REQUEST LATENCY (connectors — internal telemetry) ─────────────────────────

CREATE TABLE IF NOT EXISTS request_latency (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID,
    endpoint    VARCHAR(100) NOT NULL,
    latency_ms  FLOAT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_latency_user_id    ON request_latency (user_id);
CREATE INDEX IF NOT EXISTS idx_request_latency_created_at ON request_latency (created_at);
