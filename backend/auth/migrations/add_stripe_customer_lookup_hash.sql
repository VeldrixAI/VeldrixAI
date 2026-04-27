-- Migration: add_stripe_customer_lookup_hash
-- Adds the stripe_customer_id_lookup column for O(log n) Stripe webhook lookup.
--
-- Zero-downtime deployment order:
--   Step 1 (this file): Add nullable column + CONCURRENT index.
--                        Safe to run while the app is live.
--   Step 2: Run the backfill script (backend/auth/scripts/backfill_stripe_lookup_hash.py)
--            after deploying the app code that writes the lookup hash.
--   Step 3 (post-backfill): Add the partial unique index.
--            Only run after confirming backfill completed successfully.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
--            Run this file with autocommit or outside a transaction block.
--            Example: psql -c "..." (not wrapped in BEGIN/COMMIT)
--
-- Rollback: DROP COLUMN stripe_customer_id_lookup CASCADE;
--           This reverts to the slow O(n) lookup — fully functional, just slower.

-- ── Step 1a: Add column ───────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS stripe_customer_id_lookup VARCHAR(64);

-- ── Step 1b: Non-unique index for lookup performance ─────────────────────────
-- Uses CONCURRENTLY to avoid table lock on production.
-- Must be run as a separate statement (no wrapping transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_stripe_customer_id_lookup
    ON users (stripe_customer_id_lookup)
    WHERE stripe_customer_id_lookup IS NOT NULL;

-- ── Step 3 (run AFTER backfill is verified): Partial unique index ─────────────
-- Uncomment and run this after the backfill script completes successfully.
-- DO NOT run as part of the initial migration.
--
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_stripe_customer_id_lookup_unique
--     ON users (stripe_customer_id_lookup)
--     WHERE stripe_customer_id_lookup IS NOT NULL;
