// lib/docs/pages.ts
// Sidebar navigation and page metadata for all VeldrixAI documentation.
// HTML content for each page lives in lib/docs/content.ts.
//
// NOTE: Full page HTML should be extracted from veldrixAI_docs.html when that
// file is available. Currently using structured stub content.

export interface DocTocEntry {
  id: string;
  label: string;
}

export interface DocNavEntry {
  id: string;
  label: string;
}

export interface DocPage {
  id: string;
  section: string;
  title: string;
  leadText?: string;
  toc: DocTocEntry[];
  prev?: DocNavEntry;
  next?: DocNavEntry;
}

export interface SidebarItem {
  id: string;
  label: string;
  badge?: string;
}

export interface SidebarGroup {
  label: string;
  items: readonly SidebarItem[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: "Get Started",
    items: [
      { id: "welcome",         label: "Welcome" },
      { id: "quickstart",      label: "Quickstart" },
      { id: "concepts",        label: "Core Concepts" },
      { id: "manage-accounts", label: "Manage accounts" },
      { id: "api-keys",        label: "Manage API keys" },
    ],
  },
  {
    label: "Trust Engine",
    items: [
      { id: "trust-overview",          label: "Overview" },
      { id: "trust-safety",            label: "Safety & Toxicity" },
      { id: "trust-hallucination",     label: "Hallucination Detection" },
      { id: "trust-bias",              label: "Bias & Fairness" },
      { id: "trust-prompt-security",   label: "Prompt Security" },
      { id: "trust-compliance",        label: "Compliance & PII" },
    ],
  },
  {
    label: "Policy Engine",
    items: [
      { id: "policy-overview",   label: "Overview" },
      { id: "policy-create",     label: "Create a policy", badge: "New" },
      { id: "policy-weights",    label: "Weights & thresholds" },
      { id: "policy-versioning", label: "Policy versioning" },
    ],
  },
  {
    label: "Agent Guard",
    items: [
      { id: "agent-overview",          label: "Overview" },
      { id: "agent-langchain",         label: "LangChain" },
      { id: "agent-crewai",            label: "CrewAI" },
      { id: "agent-autogen",           label: "AutoGen", badge: "Beta" },
      { id: "agent-tool-interception", label: "Tool Interception" },
    ],
  },
  {
    label: "Audit & Compliance",
    items: [
      { id: "audit-trails",    label: "Audit Trails" },
      { id: "audit-reports",   label: "PDF Reports" },
      { id: "audit-retention", label: "Log Retention" },
    ],
  },
  {
    label: "Prompt Architect",
    items: [
      { id: "prompt-overview",  label: "Prompt Architect" },
      { id: "prompt-generate",  label: "Generate Templates" },
      { id: "prompt-modes",     label: "Strict / Balanced / Adaptive" },
    ],
  },
  {
    label: "Accounts & Billing",
    items: [
      { id: "billing-accounts", label: "Manage accounts" },
      { id: "billing-overview", label: "Billing overview" },
      { id: "billing-plans",    label: "Plans & Pricing" },
      { id: "billing-usage",    label: "Usage metering" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "integrations-overview", label: "Overview" },
      { id: "integrations-python",   label: "Python SDK" },
      { id: "integrations-ts",       label: "TypeScript SDK" },
      { id: "integrations-rest",     label: "REST API" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "ref-enforcement", label: "Enforcement Actions" },
      { id: "ref-security",    label: "Security & Compliance" },
      { id: "ref-billing",     label: "Billing information" },
    ],
  },
];

// Flat list of all page IDs and labels for search and static params
export const ALL_PAGES: DocNavEntry[] = SIDEBAR_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ id: item.id, label: item.label }))
);

// Find section name for a given slug
export function getSectionForSlug(slug: string): string {
  for (const group of SIDEBAR_GROUPS) {
    if (group.items.some((i) => i.id === slug)) return group.label;
  }
  return "Documentation";
}

// Prev/next navigation relative to flat page list
export function getPrevNext(slug: string): { prev?: DocNavEntry; next?: DocNavEntry } {
  const idx = ALL_PAGES.findIndex((p) => p.id === slug);
  return {
    prev: idx > 0 ? ALL_PAGES[idx - 1] : undefined,
    next: idx < ALL_PAGES.length - 1 ? ALL_PAGES[idx + 1] : undefined,
  };
}
