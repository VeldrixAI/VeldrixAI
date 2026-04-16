# Migration 007: Remove Duplicate Audit Trail Entries

## Problem
The VeldrixAI backend was writing duplicate `trust_evaluation` entries to the `audit_trails` table because both `trust_controller.py` and `telemetry.py` were independently calling the internal audit trail endpoint for every evaluation.

## Solution
This migration and code changes fix the issue by:

1. **Removing duplicate audit write** - Removed `_record_audit_trail()` function from `trust_controller.py` since `telemetry.py` already handles it
2. **Adding deduplication guard** - Added database-level check in `internal_log_audit` endpoint to skip inserts when a record with the same `request_id` already exists
3. **Cleaning up existing duplicates** - SQL migration removes all duplicate rows, keeping only the oldest record per `request_id`
4. **Preventing future duplicates** - Added unique index on `(user_id, request_id, action_type)` to enforce uniqueness at database level
5. **Case-insensitive verdict matching** - Updated analytics SQL queries to use `LOWER()` for case-insensitive matching of verdicts

## How to Apply

### Step 1: Apply the SQL Migration

Connect to your PostgreSQL database and run the migration:

```bash
# Using psql
psql -U veldrix_user -d veldrix_local -f backend/connectors/migrations/007_remove_duplicate_audit_trails.sql

# Or using Docker
docker exec -i veldrixai-postgres-1 psql -U veldrix_user -d veldrix_local < backend/connectors/migrations/007_remove_duplicate_audit_trails.sql
```

### Step 2: Restart Backend Services

After applying the migration, restart the backend services to load the updated code:

```bash
# If using Docker Compose
docker compose restart aegisai-core aegisai-connectors

# Or restart individual services
docker compose restart aegisai-core
docker compose restart aegisai-connectors
```

### Step 3: Verify the Fix

1. Check that duplicates were removed:
```sql
SELECT 
    request_id, 
    user_id, 
    COUNT(*) as count 
FROM audit_trails 
WHERE action_type = 'trust_evaluation' 
  AND request_id IS NOT NULL
GROUP BY request_id, user_id 
HAVING COUNT(*) > 1;
```
This should return 0 rows.

2. Check the unique index was created:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'audit_trails' 
  AND indexname = 'idx_audit_trails_unique_request';
```

3. Verify dashboard stats are now accurate by checking the Total Audited count matches the actual number of unique evaluations.

## What Changed

### Backend Files Modified:
- `backend/core/src/api/trust_controller.py` - Removed `_record_audit_trail()` function
- `backend/connectors/src/modules/analytics/audit_controller.py` - Added deduplication guard in `internal_log_audit()`
- `backend/connectors/src/modules/analytics/controller.py` - Made verdict matching case-insensitive with `LOWER()`

### New Files:
- `backend/connectors/migrations/007_remove_duplicate_audit_trails.sql` - SQL migration to clean up duplicates

## Expected Results

After applying this fix:
- ✅ No more duplicate audit trail entries
- ✅ Dashboard "Total Audited" count is accurate
- ✅ Sub-stats (completed, failed, warned) show correct numbers
- ✅ Verdict matching works regardless of case (safe/SAFE, block/BLOCK, etc.)
- ✅ Database enforces uniqueness at the constraint level

## Rollback (if needed)

If you need to rollback the unique index (not recommended):

```sql
DROP INDEX IF EXISTS idx_audit_trails_unique_request;
```

Note: This will not restore the deleted duplicate records. Make a database backup before applying the migration if you need to preserve duplicates.
