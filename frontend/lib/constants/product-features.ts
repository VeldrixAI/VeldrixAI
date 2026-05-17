// lib/constants/product-features.ts
// Canonical trust pillar and feature definitions for VeldrixAI.
// Used by the landing page and docs — never scatter as raw JSX strings.

export const TRUST_PILLARS = [
  {
    id: "safety",
    name: "Safety & Toxicity",
    displayName: "Integrity Shield",
    description:
      "Detects harmful, violent, dangerous, or self-harm-inducing content in AI output. Multi-stage PII scrubbing using zero-shot semantic detectors for absolute data privacy.",
    icon: "shield",
    color: "violet",
  },
  {
    id: "hallucination",
    name: "Hallucination Detection",
    displayName: "Truth Verification",
    description:
      "Estimates factual confidence and flags fabricated information, false citations, or invented statistics. Real-time prevention via RAG-based factual consensus protocols.",
    icon: "search",
    color: "emerald",
  },
  {
    id: "bias",
    name: "Bias & Fairness",
    displayName: "Audit Trace",
    description:
      "Identifies discriminatory framing, gender or racial stereotyping, or ethically problematic outputs. Immutable ledger tracking for complete regulatory transparency.",
    icon: "balance",
    color: "violet",
  },
  {
    id: "prompt-security",
    name: "Prompt Security",
    displayName: "Policy Engine",
    description:
      "Detects prompt injection attacks, jailbreak attempts, role-playing exploits, and adversarial input patterns. Dynamic RBAC policies that inject context-aware guardrails.",
    icon: "lock",
    color: "indigo",
  },
  {
    id: "compliance",
    name: "Compliance & PII",
    displayName: "Risk Scoring",
    description:
      "Scans for personally identifiable information, regulated data categories, and policy-specific prohibited disclosures. Predictive risk assessment using specialized Veldrix Guard models.",
    icon: "file-check",
    color: "rose",
  },
] as const;

export const ENFORCEMENT_ACTIONS = [
  { action: "allow",      priority: 7, description: "Pass response through unchanged" },
  { action: "block",      priority: 2, description: "Suppress response; return safe fallback" },
  { action: "rewrite",    priority: 3, description: "Replace with policy-safe version" },
  { action: "mask",       priority: 5, description: "Redact PII/sensitive entities in-place" },
  { action: "disclaimer", priority: 6, description: "Append required legal or regulatory disclosure" },
  { action: "escalate",   priority: 1, description: "Route to human review queue; hold delivery" },
  { action: "regenerate", priority: 4, description: "Re-invoke LLM with adjusted prompt; re-evaluate" },
] as const;

export const INTEGRATIONS = [
  { name: "LangChain",   status: "stable", category: "Agent Framework" },
  { name: "CrewAI",      status: "stable", category: "Agent Framework" },
  { name: "AutoGen",     status: "beta",   category: "Agent Framework" },
  { name: "OpenAI",      status: "stable", category: "LLM Provider" },
  { name: "Anthropic",   status: "stable", category: "LLM Provider" },
  { name: "NVIDIA NIM",  status: "stable", category: "Inference" },
  { name: "AWS Bedrock", status: "stable", category: "Enterprise Inference" },
] as const;

export const GOVERNANCE_FEATURES = [
  {
    title: "High-Fidelity Log Streams",
    description:
      "Real-time status tracking for every request, with automated scoring and engine-level diagnostics.",
    color: "#10b981",
  },
  {
    title: "Automated Compliance Scoring",
    description:
      "Instant validation against SOC2, HIPAA, and custom enterprise regulatory frameworks.",
    color: "#7c3aed",
  },
] as const;

export const SCALE_FEATURES = [
  "Dynamic Regulatory Mappings (GDPR, HIPAA, AI Act)",
  "Semantic Hallucination & Bias Drift Heatmaps",
  "Financial Guardrails for Global LLM Consumption",
] as const;

export const TRUST_BADGES = [
  { name: "SOC2 Type II",         icon: "shield-check" },
  { name: "ISO 27001",            icon: "lock" },
  { name: "NVIDIA Elite Partner", icon: "monitor" },
  { name: "GDPR Certified",       icon: "file-text" },
] as const;

export type TrustPillar = (typeof TRUST_PILLARS)[number];
export type EnforcementAction = (typeof ENFORCEMENT_ACTIONS)[number];
export type Integration = (typeof INTEGRATIONS)[number];
