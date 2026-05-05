"use client";
import { motion } from "framer-motion";
import { Shield, CircleAlert, Scale, Lock, FileCheck } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/animations/StaggerContainer";
import FadeUp from "@/components/animations/FadeUp";

const pillars = [
  {
    icon: Shield,
    name: "Safety & Toxicity",
    description: "Detects harmful content, hate speech, and unsafe outputs before delivery.",
    score: "98/100",
  },
  {
    icon: CircleAlert,
    name: "Hallucination Detection",
    description: "Scores factual grounding and flags unverified claims in generated responses.",
    score: "74/100",
  },
  {
    icon: Scale,
    name: "Bias & Fairness",
    description: "Surfaces demographic bias and ensures equitable treatment across user groups.",
    score: "96/100",
  },
  {
    icon: Lock,
    name: "Prompt Security",
    description: "Identifies injection attempts, jailbreaks, and adversarial input patterns.",
    score: "61/100",
  },
  {
    icon: FileCheck,
    name: "Compliance & PII",
    description: "Enforces data residency rules and redacts sensitive personal information.",
    score: "41/100",
  },
];

export default function TrustPillars() {
  return (
    <section className="py-24 md:py-28 px-6" id="platform">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <FadeUp className="text-center mb-16">
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-3">
            Five Pillars
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-1.5px] mb-4"
            style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
          >
            Five Dimensions of Trust
          </h2>
          <p className="font-body font-light text-[17px] text-snow/50 max-w-md mx-auto leading-relaxed">
            Evaluated at every inference call, in under 50ms.
          </p>
        </FadeUp>

        {/* Cards grid */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <StaggerItem key={pillar.name}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="group relative flex flex-col gap-4 p-8 rounded-[14px] min-h-[220px] cursor-default transition-all duration-300"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,58,237,0.3)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 1px rgba(124,58,237,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <Icon
                    size={20}
                    className="text-snow/40 group-hover:text-violet transition-colors duration-300"
                  />
                  <div className="flex flex-col gap-2 flex-1">
                    <h3 className="font-display font-semibold text-[16px] text-white tracking-[-0.5px]">
                      {pillar.name}
                    </h3>
                    <p className="font-body font-light text-[14px] text-snow/50 leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-snow/30 self-end">
                    avg {pillar.score}
                  </span>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
