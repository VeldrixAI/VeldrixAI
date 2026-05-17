export type BillingInterval = "monthly" | "annual";

export type PlanId = "free" | "grow" | "scale" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  evaluationsPerMonth: string;
  overageRate: string;
  highlight: boolean;
  cta: string;
  ctaHref: string;
}

export interface PlanFeature {
  label: string;
  free: string | boolean | null;
  grow: string | boolean | null;
  scale: string | boolean | null;
  enterprise: string | boolean | null;
  [key: string]: string | boolean | null;
}

export interface Addon {
  name: string;
  description: string;
  plan: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For individuals and side projects",
    monthlyPrice: 0,
    annualPrice: 0,
    evaluationsPerMonth: "1,000",
    overageRate: "—",
    highlight: false,
    cta: "Start free",
    ctaHref: "/signup",
  },
  {
    id: "grow",
    name: "Grow",
    tagline: "For growing teams shipping AI products",
    monthlyPrice: 49,
    annualPrice: 39,
    evaluationsPerMonth: "25,000",
    overageRate: "$0.002/eval",
    highlight: true,
    cta: "Start 14-day trial",
    ctaHref: "/dashboard/billing/checkout?plan=grow&cycle=monthly",
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For production AI at enterprise scale",
    monthlyPrice: 199,
    annualPrice: 159,
    evaluationsPerMonth: "150,000",
    overageRate: "$0.001/eval",
    highlight: false,
    cta: "Start 14-day trial",
    ctaHref: "/dashboard/billing/checkout?plan=scale&cycle=monthly",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom deployment for regulated industries",
    monthlyPrice: null,
    annualPrice: null,
    evaluationsPerMonth: "Unlimited",
    overageRate: "Included",
    highlight: false,
    cta: "Contact sales",
    ctaHref: "mailto:sales@veldrixai.ca?subject=Enterprise+Inquiry",
  },
];

export const PLAN_FEATURES: PlanFeature[] = [
  { label: "Monthly evaluations",      free: "1,000",     grow: "25,000",    scale: "150,000",   enterprise: "Unlimited" },
  { label: "All 5 trust pillars",      free: true,        grow: true,        scale: true,        enterprise: true },
  { label: "REST API access",          free: true,        grow: true,        scale: true,        enterprise: true },
  { label: "Audit trail & logs",       free: false,       grow: true,        scale: true,        enterprise: true },
  { label: "Dashboard analytics",      free: false,       grow: true,        scale: true,        enterprise: true },
  { label: "Webhook integrations",     free: false,       grow: true,        scale: true,        enterprise: true },
  { label: "Custom pillar weights",    free: false,       grow: false,       scale: true,        enterprise: true },
  { label: "SSO / SAML",              free: false,       grow: false,       scale: true,        enterprise: true },
  { label: "Priority support SLA",     free: false,       grow: false,       scale: "4h SLA",    enterprise: "1h SLA" },
  { label: "On-prem / VPC deploy",     free: false,       grow: false,       scale: false,       enterprise: true },
  { label: "Custom model fine-tuning", free: false,       grow: false,       scale: false,       enterprise: true },
  { label: "Dedicated success manager",free: false,       grow: false,       scale: false,       enterprise: true },
  { label: "SLA guarantee",            free: false,       grow: false,       scale: "99.9%",     enterprise: "99.99%" },
];

export const ADDONS: Addon[] = [
  {
    name: "Extra Evaluations",
    description: "Top up your monthly quota on demand — no plan change required.",
    plan: "Grow & Scale",
  },
  {
    name: "Extended Audit Retention",
    description: "Retain audit logs beyond the default 90-day window for compliance.",
    plan: "Scale & Enterprise",
  },
  {
    name: "Dedicated Infrastructure",
    description: "Isolated compute and storage for zero-trust enterprise deployments.",
    plan: "Enterprise only",
  },
];

export const PRICING_FAQ: FaqItem[] = [
  {
    q: "Is there a free trial?",
    a: "Yes — all paid plans include a 14-day free trial. No credit card required to start. You'll only be charged after the trial ends if you choose to continue.",
  },
  {
    q: "What counts as an evaluation?",
    a: "One evaluation is a single prompt/response pair assessed across all five trust pillars. Batch requests count as one evaluation per item in the batch.",
  },
  {
    q: "What happens if I exceed my monthly quota?",
    a: "On Grow and Scale plans, overages are billed at the per-evaluation rate shown on your plan. You can also set a hard cap to prevent unexpected charges.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Yes. Upgrades take effect immediately and are prorated. Downgrades take effect at the start of the next billing cycle.",
  },
  {
    q: "Is my data used to train models?",
    a: "No. Your prompts and responses are never used to train any model. All data is processed ephemerally and stored only in your own audit log.",
  },
  {
    q: "Do you offer discounts for startups or non-profits?",
    a: "Yes — contact sales@veldrixai.ca with details about your organisation and we'll work something out.",
  },
];
