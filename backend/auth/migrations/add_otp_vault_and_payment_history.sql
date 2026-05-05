-- VeldrixAI — Billing OTP + Payment History tables
-- These are auto-created by SQLAlchemy's Base.metadata.create_all() on startup.
-- Run this manually only if you need to apply outside of the ORM bootstrap.
--
-- Target: veldrix_auth database (same as the auth service)
-- Run:  psql -U postgres -p 5433 -d veldrix_auth -f this_file.sql

CREATE TABLE IF NOT EXISTS payment_otp_vault (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_intent_id VARCHAR(200) NOT NULL,
    payment_method_id VARCHAR(200) NOT NULL,
    encrypted_otp     TEXT NOT NULL,
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    max_attempts      INTEGER NOT NULL DEFAULT 5,
    expires_at        TIMESTAMPTZ NOT NULL,
    used_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_otp_vault_user_pi
    ON payment_otp_vault (user_id, payment_intent_id);

CREATE TABLE IF NOT EXISTS payment_history (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_intent_id    VARCHAR(200) NOT NULL UNIQUE,
    amount                      INTEGER NOT NULL,
    currency                    VARCHAR(10) NOT NULL DEFAULT 'usd',
    status                      VARCHAR(50) NOT NULL,
    plan_name                   VARCHAR(100),
    receipt_email               VARCHAR(255),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_payment_history_user_id
    ON payment_history (user_id);
