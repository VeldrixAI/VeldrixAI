export const AUDIT_VERIFICATION_PROMPT = `
## Task: Audit Trail Integrity Verification

### Objective
Verify that the audit trail is truly immutable and that every meaningful action
is correctly recorded with all required fields.

### Step 1 — Pre-action Baseline
1. Navigate to /dashboard/audit-trails
2. Record the total count of entries and the ID of the most recent entry
3. Take a screenshot of the current state

### Step 2 — Trigger Auditable Actions
Perform each of the following actions and return to the audit log after each:
1. Log in (if not already) → expect a "login" event
2. Generate a new API key named "audit-verify-key-{timestamp}"
3. Submit a trust evaluation (any prompt/response)
4. Revoke the API key you just created

### Step 3 — Verify Each Action is Logged
For each action, confirm:
- The action appears in the audit trail
- Timestamp is recent (within last 60 seconds)
- Action type matches (login, create_api_key, trust_evaluation, revoke_api_key)
- No edit/delete controls exist on any audit row

### Step 4 — Immutability Check
1. Inspect the DOM of several audit rows
2. Confirm zero edit buttons, zero delete buttons, zero modification controls
3. Attempt to modify an audit record via direct API call if possible:
   PATCH /api/audit-trails/{id} with { "action_type": "tampered" }
   → Must return 405 Method Not Allowed or 403 Forbidden

### Step 5 — Pagination and Data Integrity
1. If more than 20 entries exist, navigate to page 2
2. Verify page 2 entries have older timestamps than page 1
3. Verify the "total" count in the API response matches visible pagination info

### Report Format
For each step, report status and any anomalies found.
`.trim();
