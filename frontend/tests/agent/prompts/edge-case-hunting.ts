export const EDGE_CASE_HUNTING_PROMPT = `
## Task: Edge Case Discovery

Explore every interactive form in the application and probe the following scenarios.
Report each finding with the output format defined in your system prompt.

### Evaluate Form Edge Cases (/dashboard/evaluate)
1. Submit with empty prompt + empty response → expect validation error
2. Submit with 10,000+ character prompt → test truncation or error handling
3. Submit with Unicode/emoji content: "Hello 🌍 tell me about 北京 and مرحبا"
4. Submit with HTML injection: <script>alert('xss')</script>
5. Submit with SQL injection attempt: ' OR 1=1; DROP TABLE users; --
6. Rapid double-click of the Evaluate button → test idempotency

### API Key Page Edge Cases (/dashboard/api-keys)
1. Generate a key with an empty name → expect validation or auto-name
2. Generate a key with a 256-character name
3. Generate a key with special chars in name: "test-key!@#$%^&*()"
4. Attempt to generate a 6th key if there's a tier limit → check error handling
5. Click the copy button twice rapidly → no double-copy state bug

### Prompt Generator Edge Cases (/dashboard/prompt-generator)
1. Submit empty base instruction → expect validation
2. Submit a 5000-character instruction → test rate limits or truncation
3. Change industry + region + strictness, then generate → all params reflected
4. Generate prompts, then navigate away and back → state cleared or persisted?

### Audit Trails Edge Cases (/dashboard/audit-trails)
1. Navigate to a non-existent audit ID: /dashboard/audit-trails/fake-id-12345
2. Apply date filter for a future date → expect empty results, no crash
3. Search for a string with special chars: "test'\"<>"
4. Scroll to bottom of a long audit list → pagination works, no infinite loop

### General Anomaly Hunting
1. Navigate to each page and check for 404s in the network tab
2. Check if any page leaks sensitive data (API keys, tokens) in the DOM source
3. Verify all external links open in a new tab (target="_blank")
4. Check for broken images or missing icons
5. Verify the page title changes correctly for each route
`.trim();
