// lib/constants/product-stats.ts
// Real documented VeldrixAI product capabilities.
// Update when product metrics change — never use raw strings in JSX.

export const PRODUCT_STATS = [
  {
    value: "5",
    label: "Trust Pillars",
    description: "Safety, Hallucination, Bias, Prompt Security, Compliance",
  },
  {
    value: "7",
    label: "Enforcement Actions",
    description: "allow · block · rewrite · mask · disclaimer · escalate · regenerate",
  },
  {
    value: "99.9%",
    label: "Uptime SLA",
    description: "Growth plan guarantee — 99.95% on Enterprise",
  },
  {
    value: "< 50ms",
    label: "P95 Latency",
    description: "Background mode adds zero latency to your critical path",
  },
] as const;

export type ProductStat = (typeof PRODUCT_STATS)[number];
