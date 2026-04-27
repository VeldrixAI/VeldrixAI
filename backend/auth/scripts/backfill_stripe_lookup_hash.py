"""
Backfill script: populate stripe_customer_id_lookup for existing users.

Run this ONCE after deploying the add_stripe_customer_lookup_hash migration
and the updated application code (billing.py with hmac_stripe_customer_id).

Usage:
    cd backend/auth
    python scripts/backfill_stripe_lookup_hash.py

Requirements:
    - DATABASE_URL and VELDRIX_VAULT_KEY must be set in the environment or .env
    - STRIPE_CUSTOMER_HASH_KEY must be set to the same value that the running
      application uses (mismatch means the backfill hash won't match live writes)

Safety:
    - Idempotent: rows where stripe_customer_id_lookup IS NOT NULL are skipped
    - Streams rows in chunks of 500 to avoid loading all users into memory
    - Exits non-zero on any decryption failure (must be investigated, not silently skipped)
    - Logs progress every 1,000 rows

Rotation note:
    If STRIPE_CUSTOMER_HASH_KEY is rotated, set stripe_customer_id_lookup = NULL
    for all rows and re-run this script with the new key.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# ── Bootstrap: load .env before any local imports ────────────────────────────
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            import os
            os.environ.setdefault(_k.strip(), _v.strip())

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("backfill")

CHUNK_SIZE = 500
LOG_EVERY = 1_000


def main() -> int:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    import os
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        return 1

    from app.vault import decrypt, hmac_stripe_customer_id

    engine = create_engine(database_url)

    total_processed = 0
    total_skipped = 0
    total_errors = 0
    offset = 0

    logger.info("Starting stripe_customer_id_lookup backfill (chunk_size=%d)", CHUNK_SIZE)

    while True:
        with Session(engine) as session:
            rows = session.execute(
                text(
                    "SELECT id, stripe_customer_id FROM users "
                    "WHERE stripe_customer_id IS NOT NULL "
                    "  AND stripe_customer_id_lookup IS NULL "
                    "ORDER BY id "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"limit": CHUNK_SIZE, "offset": offset},
            ).fetchall()

        if not rows:
            break

        updates: list[dict] = []
        for row in rows:
            user_id, encrypted_cid = row.id, row.stripe_customer_id
            try:
                plaintext_cid = decrypt(encrypted_cid)
                lookup_hash = hmac_stripe_customer_id(plaintext_cid)
                updates.append({"uid": str(user_id), "hash": lookup_hash})
            except Exception as exc:
                logger.error(
                    "Decryption failed for user_id=%s — HALTING: %s", user_id, exc
                )
                return 1  # Non-zero exit: caller must investigate

        if updates:
            with Session(engine) as session:
                session.execute(
                    text(
                        "UPDATE users SET stripe_customer_id_lookup = :hash "
                        "WHERE id = :uid AND stripe_customer_id_lookup IS NULL"
                    ),
                    updates,
                )
                session.commit()

        total_processed += len(updates)
        total_skipped += len(rows) - len(updates)
        offset += CHUNK_SIZE

        if total_processed % LOG_EVERY < CHUNK_SIZE:
            logger.info(
                "Progress: processed=%d skipped=%d errors=%d",
                total_processed, total_skipped, total_errors,
            )

    logger.info(
        "Backfill complete: processed=%d skipped=%d errors=%d",
        total_processed, total_skipped, total_errors,
    )

    if total_errors > 0:
        logger.error(
            "%d rows failed — investigate decryption errors before running "
            "the unique index migration (Step 3)", total_errors,
        )
        return 1

    logger.info(
        "All rows populated. You may now run Step 3 of the migration to add "
        "the partial unique index. See migrations/add_stripe_customer_lookup_hash.sql"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
