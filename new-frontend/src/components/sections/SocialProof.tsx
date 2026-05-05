"use client";
import FadeUp from "@/components/animations/FadeUp";
import MetricCounter from "@/components/ui/MetricCounter";
import { StaggerContainer, StaggerItem } from "@/components/animations/StaggerContainer";

const testimonials = [
  {
    initials: "PM",
    name: "Priya M.",
    role: "Head of AI Platform",
    company: "Fintech Series B",
    quote:
      "We intercepted 847 policy violations in our first 30 days. VeldrixAI found issues in production our QA team missed entirely.",
  },
  {
    initials: "JK",
    name: "James K.",
    role: "Staff Engineer, AI Infrastructure",
    company: "Healthcare SaaS",
    quote:
      "The HIPAA compliance pillar alone saved us a full quarter of custom guardrail work. Integration took 40 minutes. I checked.",
  },
  {
    initials: "SR",
    name: "Sofia R.",
    role: "VP of Engineering",
    company: "Legal Tech Unicorn",
    quote:
      "Our agents were quietly hallucinating citations in production. VeldrixAI's hallucination pillar caught 94% of them before any user saw them.",
  },
];

export default function SocialProof() {
  return (
    <section className="py-24 md:py-28 px-6" id="social-proof">
      <div className="max-w-7xl mx-auto">
        {/* Metrics bar */}
        <FadeUp>
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-16 py-16 mb-20"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.07)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <MetricCounter
              value={2.4}
              suffix="B+"
              decimals={1}
              label="Evaluations Run"
            />
            <div
              className="hidden sm:block w-px h-12"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
            <MetricCounter
              value={50}
              prefix="<"
              suffix="ms"
              decimals={0}
              label="Median Latency"
            />
            <div
              className="hidden sm:block w-px h-12"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
            <MetricCounter
              value={99.97}
              suffix="%"
              decimals={2}
              label="Uptime (90d)"
            />
          </div>
        </FadeUp>

        {/* Header */}
        <FadeUp className="text-center mb-12">
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-3">
            What Teams Say
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-1.5px]"
            style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
          >
            Trusted by AI Engineering Teams
          </h2>
        </FadeUp>

        {/* Testimonials */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <StaggerItem key={t.name}>
              <div
                className="flex flex-col gap-5 p-7 rounded-[14px] h-full"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <p className="font-body font-light text-[14px] text-snow/60 leading-[1.75] italic flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.2)" }}
                  >
                    <span className="font-display font-bold text-[12px] text-violet">
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <p className="font-body font-medium text-[13px] text-snow/90">{t.name}</p>
                    <p className="font-body text-[12px] text-snow/40">
                      {t.role}, {t.company}
                    </p>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
