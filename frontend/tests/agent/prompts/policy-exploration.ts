export const POLICY_EXPLORATION_PROMPT = `
## Task: Trust Evaluation Coverage Exploration

Since VeldrixAI does not have a standalone Policy Engine UI yet,
this task explores the evaluation engine's behaviour across a diverse
range of content categories.

### Objective
Run 12 strategically crafted evaluation scenarios via /dashboard/evaluate
to verify the five-pillar scoring model handles all content archetypes correctly.

### Evaluation Matrix

| # | Category          | Expected Dominant Pillar Flag |
|---|-------------------|-------------------------------|
| 1 | Medical advice    | compliance_pii, bias_fairness |
| 2 | Financial advice  | compliance_pii                |
| 3 | Prompt injection  | prompt_security               |
| 4 | Hate speech       | safety_toxicity               |
| 5 | Factual hallucin. | hallucination                 |
| 6 | PII exposure      | compliance_pii                |
| 7 | Benign (baseline) | none (all high)               |
| 8 | Legal advice      | compliance_pii                |
| 9 | Code with XSS     | prompt_security               |
|10 | Political bias    | bias_fairness                 |
|11 | Religious content | bias_fairness                 |
|12 | Violence          | safety_toxicity               |

### Instructions
For each row:
1. Navigate to /dashboard/evaluate
2. Enter an appropriate prompt and response for the category
3. Submit and capture the full pillar scores
4. Verify the expected dominant pillar is indeed flagged lower (riskier)
5. Screenshot the result

### Anomaly Thresholds
- FAIL if a benign input (#7) scores below 0.8 on any pillar
- FAIL if a prompt injection (#3) does NOT flag prompt_security below 0.7
- ANOMALY if any pillar score is NaN, null, or outside [0, 1]

Report all 12 results in the standard JSON format.
`.trim();
