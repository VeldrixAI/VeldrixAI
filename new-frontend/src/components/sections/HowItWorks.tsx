"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import FadeUp from "@/components/animations/FadeUp";
import CodeBlock from "@/components/ui/CodeBlock";
import type { CodeLine } from "@/components/ui/CodeBlock";

const codeLines: CodeLine[] = [
  { tokens: [{ text: "import", type: "keyword" }, { text: " veldrix", type: "plain" }] },
  { tokens: [] },
  { tokens: [{ text: "veldrix", type: "plain" }, { text: ".", type: "plain" }, { text: "init", type: "function" }, { text: "(", type: "plain" }, { text: "api_key", type: "param" }, { text: "=", type: "plain" }, { text: '"vx-..."', type: "string" }, { text: ")", type: "plain" }] },
  { tokens: [] },
  { tokens: [{ text: "@veldrix", type: "decorator" }, { text: ".", type: "decorator" }, { text: "guard", type: "decorator" }] },
  { tokens: [{ text: "def", type: "keyword" }, { text: " generate_response(", type: "plain" }, { text: "prompt", type: "param" }, { text: ": ", type: "plain" }, { text: "str", type: "keyword" }, { text: ") -> ", type: "plain" }, { text: "str", type: "keyword" }, { text: ":", type: "plain" }] },
  { tokens: [{ text: "    return", type: "keyword" }, { text: " llm", type: "plain" }, { text: ".", type: "plain" }, { text: "complete", type: "function" }, { text: "(", type: "plain" }, { text: "prompt", type: "param" }, { text: ")", type: "plain" }] },
];

const steps = [
  {
    number: "01",
    title: "Integrate SDK",
    description:
      "pip install veldrixai\n\nThe @veldrix.guard decorator wraps your LLM calls in seconds.",
    code: true,
  },
  {
    number: "02",
    title: "Define Policies",
    description:
      "Upload your policy document or use our templates.\n\nStrict / Balanced / Adaptive modes.",
    code: false,
  },
  {
    number: "03",
    title: "Enforce at Runtime",
    description:
      "Every call evaluated, logged, and enforced.\n\nAudit trail generated automatically.",
    code: false,
  },
];

function ConnectorArrow({ index }: { index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div ref={ref} className="hidden lg:flex items-center justify-center w-16 shrink-0 mt-8">
      <svg width="60" height="20" viewBox="0 0 60 20" fill="none">
        <motion.line
          x1="0"
          y1="10"
          x2="48"
          y2="10"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : {}}
          transition={{ duration: 0.6, delay: index * 0.15 + 0.4 }}
        />
        <motion.path
          d="M46 6L52 10L46 14"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: index * 0.15 + 0.9 }}
        />
      </svg>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section className="py-24 md:py-28 px-6" id="how-it-works">
      <div className="max-w-7xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-3">
            Integration
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-1.5px] mb-4"
            style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
          >
            How It Works
          </h2>
          <p className="font-body font-light text-[17px] text-snow/50 max-w-md mx-auto leading-relaxed">
            From zero to governed in 15 minutes.
          </p>
        </FadeUp>

        <div className="flex flex-col lg:flex-row items-start gap-0">
          {steps.map((step, i) => (
            <div key={step.number} className="flex flex-col lg:flex-row items-start flex-1">
              <FadeUp delay={i * 0.15} className="flex flex-col gap-5 flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono text-[11px] px-2 py-1 rounded"
                    style={{
                      color: "#7C3AED",
                      background: "rgba(124,58,237,0.1)",
                      border: "1px solid rgba(124,58,237,0.2)",
                    }}
                  >
                    {step.number}
                  </span>
                  <h3 className="font-display font-semibold text-[22px] text-white tracking-[-0.5px]">
                    {step.title}
                  </h3>
                </div>

                <div className="pl-1 flex flex-col gap-2">
                  {step.description.split("\n\n").map((para, j) => (
                    <p key={j} className="font-body font-light text-[15px] text-snow/50 leading-relaxed">
                      {para}
                    </p>
                  ))}
                </div>

                {step.code && (
                  <CodeBlock
                    lines={codeLines}
                    className="mt-2"
                    copyText="import veldrix\n\nveldrix.init(api_key='vx-...')\n\n@veldrix.guard\ndef generate_response(prompt: str) -> str:\n    return llm.complete(prompt)"
                    showCopy={true}
                  />
                )}
              </FadeUp>

              {i < steps.length - 1 && (
                <ConnectorArrow index={i} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
