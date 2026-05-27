export const HEADLINES = {
  a: {
    primary: "Runtime Trust Infrastructure for Production AI.",
    secondary:
      "VeldrixAI evaluates every LLM response in under 500ms and gives you the audit trail to prove it.",
  },
  b: {
    primary: "Catch what your LLM gets wrong.",
    secondary:
      "Runtime evaluation across five safety pillars, with an immutable audit log your compliance team will actually accept.",
  },
  c: {
    primary: "The control plane for AI output.",
    secondary:
      "One SDK line. Five evaluation pillars. Sub-500ms p95. The audit trail comes free.",
  },
} as const;

export type HeadlineVariant = keyof typeof HEADLINES;
