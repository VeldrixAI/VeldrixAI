"use client";
import { motion } from "framer-motion";
import FadeUp from "@/components/animations/FadeUp";
import { StaggerContainer, StaggerItem } from "@/components/animations/StaggerContainer";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "/month",
    description: "For developers exploring AI governance.",
    cta: "Start Free",
    ctaStyle: "secondary",
    recommended: false,
    features: [
      "50,000 evaluations/month",
      "All 5 trust pillars",
      "Community policies",
      "7-day audit retention",
      "API access",
      "Community support",
    ],
  },
  {
    name: "Growth",
    price: "$299",
    period: "/month",
    description: "For teams shipping AI to production.",
    cta: "Start Trial",
    ctaStyle: "primary",
    recommended: true,
    features: [
      "5M evaluations/month",
      "All 5 trust pillars",
      "Custom policy uploads",
      "90-day audit retention",
      "Webhook integrations",
      "Slack alerting",
      "Priority support",
      "SOC 2 report access",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations with compliance requirements.",
    cta: "Contact Sales",
    ctaStyle: "secondary",
    recommended: false,
    features: [
      "Unlimited evaluations",
      "Custom pillars & models",
      "Policy review SLA",
      "Unlimited audit retention",
      "SSO & RBAC",
      "Private deployment",
      "Dedicated support",
      "HIPAA & GDPR DPAs",
    ],
  },
];

export default function Pricing() {
  return (
    <section className="py-24 md:py-28 px-6" id="pricing">
      <div className="max-w-7xl mx-auto">
        <FadeUp className="text-center mb-14">
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-3">
            Pricing
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-1.5px] mb-4"
            style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
          >
            Simple, Transparent Pricing
          </h2>
          <p className="font-body font-light text-[17px] text-snow/50 max-w-md mx-auto">
            No surprise overages. No hidden governance taxes.
          </p>
        </FadeUp>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <StaggerItem key={plan.name}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="relative flex flex-col gap-6 p-8 rounded-[14px] h-full"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: plan.recommended
                    ? "1px solid rgba(124,58,237,0.4)"
                    : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {/* Recommended badge */}
                {plan.recommended && (
                  <span
                    className="absolute top-4 right-4 font-body text-[10px] tracking-[2px] uppercase px-2 py-1 rounded"
                    style={{
                      color: "#7C3AED",
                      background: "rgba(124,58,237,0.12)",
                      border: "1px solid rgba(124,58,237,0.2)",
                    }}
                  >
                    Recommended
                  </span>
                )}

                {/* Plan name & price */}
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-semibold text-[18px] text-white tracking-[-0.5px]">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display font-bold text-[36px] text-white tracking-[-1px]">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="font-body text-[14px] text-snow/40">{plan.period}</span>
                    )}
                  </div>
                  <p className="font-body text-[13px] text-snow/40 leading-relaxed">
                    {plan.description}
                  </p>
                </div>

                {/* CTA */}
                <motion.a
                  href="#"
                  whileTap={{ scale: 0.97 }}
                  className={`font-display font-semibold text-[14px] text-center py-3 rounded-lg transition-colors duration-200 ${
                    plan.ctaStyle === "primary"
                      ? "bg-violet text-white hover:bg-indigo"
                      : "border border-white/10 text-snow/70 hover:text-snow/100 hover:border-white/20"
                  }`}
                >
                  {plan.cta}
                </motion.a>

                {/* Features */}
                <div className="flex flex-col gap-3 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <span className="text-snow/20 mt-[3px] shrink-0">·</span>
                      <span className="font-body text-[13px] text-snow/60 leading-relaxed">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
