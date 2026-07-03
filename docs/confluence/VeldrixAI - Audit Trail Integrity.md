# VeldrixAI — Audit Trail Integrity (Hash Chain & Append-Only)

> **Page status:** Current · **Last updated:** 2026-07-03 · **Audience:** Engineering, compliance
> **Source of truth:** `backend/connectors/.../audit_hash.py`, migration `010_audit_hash_chain.sql` · long-form in `docs/AUDIT_INTEGRITY.md`

## What this delivers

The `audit_trails` table is the system of record for every trust evaluation and policy decision. Phase 2 Part A made it:

- **Tamper-evident** — after-the-fact edits are cryptographically detectable.
- **Append-only** — the database itself refuses UPDATE/DELETE, even via direct SQL.

Before Part A, immutability was only a convention (plain JSONB table, a user-scoped DELETE endpoint existed). That gap is closed; the DELETE route was removed.

## The hash chain

Each row carries three columns:

| Column | Meaning |
|---|---|
| `record_hash` | `sha256:` digest committing to the row's full identity **+ `prev_hash`** |
| `prev_hash` | The `record_hash` of the previous row in **this tenant's** chain |
| `chain_seq` | Per-tenant monotonic position (deterministic verification order) |

### Recipe

```
record_hash = "sha256:" + sha256( canonical_json(identity) + "\n" + prev_hash )
canonical_json(obj) = json.dumps(obj, sort_keys=True, separators=(",", ":"))
identity = { action_type, entity_type, entity_id, user_id,
             request_id, created_at (ISO-8601), action_metadata }
```

Key properties:

- The hash commits to the **whole row identity**, not just the payload — editing any field (verdict, actor, timestamp, or the honesty markers `enforced` / `mode` / `*_evaluated` / `engine_error` inside `action_metadata`) invalidates `record_hash` and every hash after it.
- `canonical_json` is **byte-for-byte identical** to the core Policy Engine's checksum recipe. The two services don't import each other, so the recipe is deliberately duplicated and **pinned by a cross-service parity test** with a known vector — neither side can drift silently.
- Neither recipe has a serialization fallback: a non-JSON-native value (e.g. `Decimal`) raises `TypeError` on **both** sides instead of being silently stringified (a previous connectors-only `default=str` broke parity and was removed — finding F-CANON-1).

### Genesis & per-tenant chains

- First record in a tenant's chain: `prev_hash = "sha256:" + "0"×64`.
- Chain key is `user_id`. System/internal writes (`user_id IS NULL`) share one **system chain** under reserved tenant UUID `00000000-0000-0000-0000-000000000000`.

### Concurrency

`record_hash` depends on the tenant's current chain head, so concurrent writes could fork the chain. Every insert takes a **per-tenant Postgres advisory lock** (`pg_advisory_xact_lock(hashtext(key))`, transaction-scoped) before reading the head — writers are serialized per tenant. This matters because core's audit POSTs are fire-and-forget and bursts are realistic.

## Append-only enforcement

```sql
CREATE TRIGGER audit_trails_append_only
    BEFORE UPDATE OR DELETE ON audit_trails
    FOR EACH ROW EXECUTE FUNCTION audit_trails_block_mutation();  -- RAISEs
```

Legitimate future migrations that must touch existing rows must explicitly `DROP TRIGGER`, migrate, and recreate it — a separately reviewed step. (The Part A backfill itself did exactly this: add columns → drop trigger → backfill chain from genesis in `(tenant, created_at, id)` order → create trigger. Backfill **must** precede trigger creation.)

## Verifying a chain

`verify_chain(rows)` takes one tenant's rows ordered by `chain_seq` and returns `None` if intact, or a description of the first broken link. Detects **tampering** (hash no longer recomputes), **deletion** (missing link), and **reordering**. Verification is fully offline — it needs nothing but the rows.

Operational endpoints (see the *Operations & Rollout* page for the metrics they feed):

```
GET  /api/audit-trails/internal/chain-health?tenant_id=<uuid>   # verify one tenant
POST /api/audit-trails/internal/chain-health/refresh            # verify all tenants
```

Chain verification is DB-heavy, so it runs on a schedule (ops/cron), **not** on every Prometheus scrape.

## Scope decisions

- **GDPR-style erasure is intentionally not implemented.** A casual delete is a tampering vector. If erasure is ever required it must be a **chain-preserving redaction** (tombstone PII fields while keeping the hashed identity verifiable) — tracked as a separate, explicitly reviewed change.
- The chain **protects** the honesty markers (`enforced`, `mode`, `*_evaluated`, `engine_error`) but does not invent them; "intent recorded but not acted on" is expressed as `enforced=false` under `shadow`/non-gating verbs.
