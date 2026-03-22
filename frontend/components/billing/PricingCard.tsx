"use client";

function Check({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export interface PricingPlan {
  id: "free" | "grow" | "scale" | "enterprise";
  name: string;
  price: { monthly: number | null; annual: number | null };
  evals: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, annual: 0 },
    evals: "1,000 evals / month",
    features: [
      "All 5 safety pillars",
      "REST API access",
      "Community support",
      "200 ms SLA",
    ],
    cta: "Start free",
  },
  {
    id: "grow",
    name: "Grow",
    price: { monthly: 49, annual: 39 },
    evals: "25,000 evals / month",
    features: [
      "Everything in Free",
      "Audit trail & logs",
      "Email support",
      "Webhook integrations",
      "Dashboard analytics",
    ],
    cta: "Get started",
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: { monthly: 199, annual: 159 },
    evals: "150,000 evals / month",
    features: [
      "Everything in Grow",
      "Priority support (4h SLA)",
      "Custom pillar weights",
      "SSO / SAML",
      "Dedicated Slack channel",
    ],
    cta: "Get started",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: { monthly: null, annual: null },
    evals: "Unlimited",
    features: [
      "Everything in Scale",
      "On-prem / VPC deployment",
      "Custom model fine-tuning",
      "SLA guarantees",
      "Dedicated success manager",
    ],
    cta: "Contact sales",
  },
];

interface PricingCardProps {
  plan: PricingPlan;
  cycle: "monthly" | "annual";
  currentPlan?: string;
  onSelect: (plan: PricingPlan) => void;
  loading?: boolean;
}

export default function PricingCard({
  plan,
  cycle,
  currentPlan,
  onSelect,
  loading = false,
}: PricingCardProps) {
  const price = cycle === "annual" ? plan.price.annual : plan.price.monthly;
  const isCurrentPlan = currentPlan === plan.id;
  const isFree = plan.id === "free";
  const isEnterprise = plan.id === "enterprise";

  return (
    <div
      style={{
        background: plan.highlighted
          ? "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(6,182,212,0.06) 100%)"
          : "rgba(255,255,255,0.03)",
        border: plan.highlighted
          ? "1px solid rgba(124,58,237,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        position: "relative",
      }}
    >
      {plan.highlighted && (
        <div
          style={{
            position: "absolute",
            top: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
            borderRadius: "20px",
            padding: "3px 14px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Most Popular
        </div>
      )}

      <div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
          {plan.name}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          {price === null ? (
            <span style={{ fontSize: "28px", fontWeight: 700, color: "#fff" }}>Custom</span>
          ) : (
            <>
              <span style={{ fontSize: "32px", fontWeight: 700, color: "#fff" }}>
                ${price}
              </span>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>/mo</span>
            </>
          )}
        </div>
        {cycle === "annual" && price !== null && price > 0 && (
          <div style={{ fontSize: "11px", color: "#06b6d4", marginTop: "4px" }}>
            Billed annually — save 20%
          </div>
        )}
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: "8px" }}>
          {plan.evals}
        </div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
        {plan.features.map((feat) => (
          <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: "rgba(255,255,255,0.75)" }}>
            <Check size={14} style={{ color: "#7c3aed", marginTop: "2px", flexShrink: 0 }} />
            {feat}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan)}
        disabled={isCurrentPlan || loading}
        style={{
          marginTop: "auto",
          padding: "10px 0",
          borderRadius: "8px",
          border: isCurrentPlan ? "1px solid rgba(255,255,255,0.15)" : "none",
          background: isCurrentPlan
            ? "transparent"
            : plan.highlighted
            ? "linear-gradient(135deg, #7c3aed, #06b6d4)"
            : isFree || isEnterprise
            ? "rgba(255,255,255,0.08)"
            : "rgba(124,58,237,0.6)",
          color: isCurrentPlan ? "rgba(255,255,255,0.4)" : "#fff",
          fontSize: "14px",
          fontWeight: 500,
          cursor: isCurrentPlan || loading ? "default" : "pointer",
          transition: "opacity 0.2s",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {isCurrentPlan ? "Current plan" : loading ? "Loading…" : plan.cta}
      </button>
    </div>
  );
}
