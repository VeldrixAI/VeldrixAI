-- Migration: add_billing_fields_to_users
-- Run this against your PostgreSQL database after deploying the billing feature.
-- Safe to run multiple times (uses IF NOT EXISTS / column-exists checks).

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id  VARCHAR  UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_id      VARCHAR  UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_tier            VARCHAR  NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status          VARCHAR  NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS eval_count_month     INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_period_end   TIMESTAMP;

-- Indexes for webhook lookups (customer_id and subscription_id are queried on every event)
CREATE INDEX IF NOT EXISTS ix_users_stripe_customer_id ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS ix_users_subscription_id    ON users (subscription_id);

COMMIT;
