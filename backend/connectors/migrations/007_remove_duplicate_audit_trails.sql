-- Migration 007: Remove duplicate audit trail entries
-- This migration removes duplicate trust_evaluation entries from audit_trails table
-- keeping only the oldest record per request_id for each user

-- Step 1: Identify and delete duplicate audit trail entries
-- Keep only the oldest record (MIN(id)) for each (user_id, request_id, action_type) combination
DELETE FROM audit_trails
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY user_id, request_id, action_type 
                ORDER BY created_at ASC, id ASC
            ) as row_num
        FROM audit_trails
        WHERE action_type = 'trust_evaluation'
          AND request_id IS NOT NULL
    ) t
    WHERE row_num > 1
);

-- Step 2: Add a unique constraint to prevent future duplicates
-- This ensures that the same request_id cannot be inserted twice for the same user and action_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_trails_unique_request 
ON audit_trails (user_id, request_id, action_type) 
WHERE request_id IS NOT NULL AND action_type = 'trust_evaluation';

-- Step 3: Add comment to document the constraint
COMMENT ON INDEX idx_audit_trails_unique_request IS 
'Prevents duplicate trust_evaluation entries for the same request_id and user_id. Added in migration 007.';
