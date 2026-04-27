"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, PLAN_FEATURES, PRICING_FAQ, ADDONS, type BillingInterval } from "@/lib/constants/pricing";

// ── Check / Cross icons ───────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="rgba(244,63,94,0.5)" strokeWidth="2" strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function FeatureCell({ value }: { value: string | boolean | null }) {
  if (value === true) return <CheckIcon />;
  if (value === false || value === null) return <CrossIcon />;
  return <span style={{ fontSize: "12px", color: "rgba(240,242,255,0.7)" }}>{value}</span>;
}

// ── FAQ accordion ─────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "16px 0",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(240,242,255,0.9)",
          fontSize: "15px",
          fontWeight: 500,
          textAlign: "left",
          gap: "12px",
          padding: 0,
        }}
      >
        {q}
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "#7c3aed",
          }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: "14px",
            lineHeight: "1.65",
            color: "rgba(240,242,255,0.6)",
          }}
        >
          {a}
        </p>
      )}
    </div>
  );
}

// ── PricingSection ────────────────────────────────────────────────────────────
export default function PricingSection() {
  const [cycle, setCycle] = useState<BillingInterval>("monthly");
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  return (
    <section id="pricing" className="lp-pricing-section section-reveal" aria-label="Pricing">
      {/* Mesh background orbs */}
      <div className="lp-pricing-orb lp-pricing-orb-1" aria-hidden="true" />
      <div className="lp-pricing-orb lp-pricing-orb-2" aria-hidden="true" />

      <div className="lp-container">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div className="lp-eyebrow">Pricing</div>
          <h2 className="lp-h2">
            Simple, Transparent <span className="shimmer-text">Pricing</span>
          </h2>
          <p className="lp-p" style={{ maxWidth: "520px", margin: "0 auto 32px" }}>
            Start with a 14-day free trial. No credit card required. Upgrade or cancel anytime.
          </p>

          {/* Billing toggle */}
          <div
            role="group"
            aria-label="Billing interval"
            style={{
              display: "inline-flex",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "100px",
              padding: "4px",
              gap: "4px",
            }}
          >
            {(["monthly", "annual"] as BillingInterval[]).map((interval) => (
              <button
                key={interval}
                onClick={() => setCycle(interval)}
                aria-pressed={cycle === interval}
                style={{
                  padding: "8px 20px",
                  borderRadius: "100px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                  background: cycle === interval ? "#7c3aed" : "transparent",
                  color: cycle === interval ? "#fff" : "rgba(240,242,255,0.55)",
                }}
              >
                {interval === "monthly" ? "Monthly" : "Annual"}
                {interval === "annual" && (
                  <span
                    style={{
                      marginLeft: "6px",
                      background: "rgba(16,185,129,0.2)",
                      color: "#10b981",
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "100px",
                      fontWeight: 600,
                    }}
                  >
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Live price announcement for screen readers */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
          >
            {cycle === "annual" ? "Showing annual prices with 20% discount" : "Showing monthly prices"}
          </div>
        </div>

        {/* Plan cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
            marginBottom: "64px",
          }}
          className="lp-pricing-cards"
        >
          {PLANS.map((plan) => {
            const price = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const isHovered = hoveredPlan === plan.id;

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredPlan(plan.id)}
                onMouseLeave={() => setHoveredPlan(null)}
                style={{
                  position: "relative",
                  background: plan.highlight
                    ? "linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(6,182,212,0.05) 100%)"
                    : "rgba(255,255,255,0.03)",
                  border: plan.highlight
                    ? "1px solid rgba(124,58,237,0.5)"
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: plan.highlight
                    ? "0 0 40px rgba(124,58,237,0.15)"
                    : isHovered
                    ? "0 0 24px rgba(124,58,237,0.08)"
                    : "none",
                  borderRadius: "20px",
                  padding: "32px 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                  transform: isHovered ? "translateY(-4px)" : "translateY(0)",
                  transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s, border-color 0.25s",
                }}
              >
                {/* Most Popular badge */}
                {plan.highlight && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-14px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
                      borderRadius: "100px",
                      padding: "4px 16px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#fff",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                    aria-label="Most popular plan"
                  >
                    Most Popular
                  </div>
                )}

                {/* Plan name + tagline */}
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: "18px",
                      color: "rgba(240,242,255,0.95)",
                      marginBottom: "4px",
                    }}
                  >
                    {plan.name}
                  </div>
                  <div style={{ fontSize: "13px", color: "rgba(240,242,255,0.45)" }}>
                    {plan.tagline}
                  </div>
                </div>

                {/* Price */}
                <div>
                  {price === null ? (
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 800,
                        fontSize: "42px",
                        background: "linear-gradient(135deg, #fff, #a78bfa)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        lineHeight: 1,
                      }}
                    >
                      Custom
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                        <span style={{ fontSize: "18px", color: "rgba(240,242,255,0.5)", fontWeight: 400 }}>$</span>
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 800,
                            fontSize: "48px",
                            lineHeight: 1,
                            background: "linear-gradient(135deg, #fff, #a78bfa)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }}
                        >
                          {price}
                        </span>
                        <span style={{ fontSize: "13px", color: "rgba(240,242,255,0.4)" }}>/mo</span>
                      </div>
                      {cycle === "annual" && (
                        <div style={{ fontSize: "12px", color: "#10b981", marginTop: "4px" }}>
                          Billed annually — save ~20%
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ fontSize: "12px", color: "rgba(240,242,255,0.4)", marginTop: "8px" }}>
                    {plan.evaluationsPerMonth} evals/month · {plan.overageRate} overage
                  </div>
                </div>

                {/* Key features — top 5 */}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                  {PLAN_FEATURES.slice(0, 5).map((feat) => {
                    const val = feat[plan.id];
                    if (val === false || val === null) return null;
                    return (
                      <li key={feat.label} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "rgba(240,242,255,0.75)" }}>
                        <CheckIcon />
                        <span>
                          <strong style={{ color: "rgba(240,242,255,0.9)" }}>{feat.label}:</strong>{" "}
                          {val === true ? "Included" : val}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* CTA */}
                <a
                  href={plan.ctaHref}
                  target={plan.ctaHref.startsWith("http") ? "_blank" : undefined}
                  rel={plan.ctaHref.startsWith("http") ? "noopener noreferrer" : undefined}
                  aria-label={`${plan.cta} — ${plan.name} plan`}
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "12px 0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                    transition: "opacity 0.2s, transform 0.15s",
                    border: plan.highlight ? "none" : "1px solid rgba(124,58,237,0.35)",
                    background: plan.highlight
                      ? "linear-gradient(135deg, #7c3aed, #06b6d4)"
                      : plan.id === "enterprise"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(124,58,237,0.15)",
                    color: "#fff",
                  }}
                >
                  {plan.cta}
                </a>
              </div>
            );
          })}
        </div>

        {/* Feature comparison table — desktop only */}
        <div className="lp-pricing-table-wrap">
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
            aria-label="Full feature comparison table"
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 16px", color: "rgba(240,242,255,0.4)", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    style={{
                      textAlign: "center",
                      padding: "12px 16px",
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: "14px",
                      color: p.highlight ? "#a78bfa" : "rgba(240,242,255,0.8)",
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((feat, i) => (
                <tr
                  key={feat.label}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "rgba(124,58,237,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)";
                  }}
                >
                  <td style={{ padding: "12px 16px", color: "rgba(240,242,255,0.65)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {feat.label}
                  </td>
                  {PLANS.map((p) => (
                    <td key={p.id} style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <FeatureCell value={feat[p.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add-ons */}
        <div style={{ marginTop: "64px", marginBottom: "64px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div className="lp-eyebrow">Add-ons &amp; Enterprise</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "24px", color: "rgba(240,242,255,0.95)", margin: "8px 0 0" }}>
              Extend Your Plan
            </h3>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "20px",
            }}
            className="lp-addons-grid"
          >
            {ADDONS.map((addon) => (
              <div
                key={addon.name}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "14px",
                  padding: "22px 20px",
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", color: "rgba(240,242,255,0.9)", marginBottom: "6px" }}>
                  {addon.name}
                </div>
                <div style={{ fontSize: "13px", color: "rgba(240,242,255,0.5)", marginBottom: "10px" }}>
                  {addon.description}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: "11px",
                    padding: "3px 10px",
                    borderRadius: "100px",
                    background: "rgba(124,58,237,0.12)",
                    color: "#a78bfa",
                    fontWeight: 600,
                  }}
                >
                  {addon.plan}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div className="lp-eyebrow">FAQ</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "24px", color: "rgba(240,242,255,0.95)", margin: "8px 0 0" }}>
              Frequently Asked Questions
            </h3>
          </div>
          {PRICING_FAQ.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
          <p style={{ marginTop: "28px", textAlign: "center", fontSize: "13px", color: "rgba(240,242,255,0.4)" }}>
            More questions?{" "}
            <a href="mailto:support@veldrixai.ca" style={{ color: "#a78bfa", textDecoration: "none" }}>
              Contact support
            </a>
            {" "}or{" "}
            <Link href="/docs/billing-plans" style={{ color: "#a78bfa", textDecoration: "none" }}>
              read the billing docs
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
