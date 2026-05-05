"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const pillars = [
  { label: "Safety & Toxicity",   score: 98, status: "PASS",  color: "#10B981", delay: 0.9 },
  { label: "Hallucination Risk",  score: 74, status: "PASS",  color: "#10B981", delay: 1.05 },
  { label: "Bias & Fairness",     score: 96, status: "PASS",  color: "#10B981", delay: 1.2 },
  { label: "Prompt Security",     score: 61, status: "WARN",  color: "#F59E0B", delay: 1.35 },
  { label: "Compliance & PII",    score: 41, status: "BLOCK", color: "#F43F5E", delay: 1.5 },
];

const statusColors: Record<string, string> = {
  PASS:  "#10B981",
  WARN:  "#F59E0B",
  BLOCK: "#F43F5E",
};

function TerminalBar({ label, score, status, delay }: { label: string; score: number; status: string; delay: number }) {
  const barColor = status === "BLOCK" ? "#F43F5E" : status === "WARN" ? "#F59E0B" : "#7C3AED";
  const filledCells = Math.round(score / 5);
  const emptyLabel = 20 - filledCells;

  return (
    <div className="flex items-center gap-3 text-[12px] md:text-[13px]">
      <span className="font-body w-[160px] md:w-[180px] text-snow/60 shrink-0">{label}</span>
      <div className="flex gap-[2px] shrink-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.1 }}
            animate={i < filledCells ? { opacity: 1 } : { opacity: 0.1 }}
            transition={{ duration: 0.05, delay: delay + i * 0.02 }}
            className="h-2 w-2 rounded-[1px]"
            style={{ backgroundColor: i < filledCells ? barColor : "rgba(255,255,255,0.08)" }}
          />
        ))}
        <span className="sr-only">{emptyLabel} empty</span>
      </div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.5 }}
        className="font-mono text-cyan w-[52px] text-right shrink-0"
      >
        {score}/100
      </motion.span>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.55 }}
        className="font-body font-medium text-[11px] tracking-wider shrink-0"
        style={{ color: statusColors[status] }}
      >
        {status}
      </motion.span>
    </div>
  );
}

export default function Hero() {
  const [progressDone, setProgressDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setProgressDone(true), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-24 overflow-hidden"
      style={{ background: "#050810" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Crosshair lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "100% 50%, 50% 100%",
        }}
      />
      {/* Center radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 800px 600px at 50% 40%, rgba(124,58,237,0.06) 0%, transparent 100%)",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
        {/* Eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0 }}
          className="flex items-center gap-2 px-4 py-2 rounded-full mb-8"
          style={{
            border: "1px solid rgba(124,58,237,0.3)",
            background: "rgba(124,58,237,0.08)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-cyan animate-blink"
            style={{ boxShadow: "0 0 8px #06B6D4" }}
          />
          <span className="font-body text-[12px] tracking-[2px] uppercase text-snow/60">
            Runtime Trust Infrastructure
          </span>
          <span className="font-mono text-[12px] text-cyan ml-1">v1.0</span>
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-display font-extrabold text-white leading-[1.05] tracking-[-3px] mb-6"
          style={{ fontSize: "clamp(52px, 7vw, 88px)" }}
        >
          Govern What Your
          <br />
          AI Does at{" "}
          <span
            style={{
              textDecoration: "underline",
              textDecorationColor: "rgba(124,58,237,0.5)",
              textUnderlineOffset: "6px",
            }}
          >
            Runtime
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="font-body font-light text-[18px] leading-[1.7] max-w-[560px] mb-10"
          style={{ color: "rgba(240,242,255,0.55)" }}
        >
          VeldrixAI sits between your LLM and production — evaluating every
          output across five trust pillars before it reaches your users.{" "}
          <span className="text-snow/70">No guardrails theater. Real enforcement.</span>
        </motion.p>

        {/* CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 flex-wrap justify-center"
        >
          <motion.a
            href="#"
            whileTap={{ scale: 0.97 }}
            className="font-display font-semibold text-[14px] bg-violet text-white px-6 py-3 rounded-lg hover:bg-indigo transition-colors duration-200"
          >
            Start Building Free
          </motion.a>
          <motion.a
            href="#"
            whileTap={{ scale: 0.97 }}
            className="group font-body text-[14px] text-snow/70 hover:text-snow/100 transition-colors duration-200 flex items-center gap-1 px-2 py-3"
          >
            View Documentation
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </motion.a>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="flex items-center gap-4 mt-10 pt-8 flex-wrap justify-center"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {["SOC 2 Ready", "Sub-50ms Latency", "99.9% Uptime SLA", "GDPR Compliant"].map(
            (item, i) => (
              <span key={item} className="flex items-center gap-4">
                {i > 0 && <span style={{ color: "rgba(240,242,255,0.2)" }}>·</span>}
                <span
                  className="font-body text-[11px] tracking-[3px] uppercase"
                  style={{ color: "rgba(240,242,255,0.3)" }}
                >
                  {item}
                </span>
              </span>
            )
          )}
        </motion.div>

        {/* Terminal */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, type: "spring", stiffness: 80, damping: 20 }}
          className="w-full max-w-3xl mt-16 rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#080c18" }}
        >
          {/* Terminal titlebar */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{
              background: "#0d1120",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald" />
            <span className="font-mono text-[12px] text-cyan ml-3">veldrix evaluate</span>
          </div>

          {/* Terminal body */}
          <div className="p-5 md:p-6 flex flex-col gap-5">
            {/* Input */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex gap-3"
            >
              <span className="font-mono text-[12px] text-snow/30 shrink-0 mt-[1px]">INPUT</span>
              <span className="font-mono text-[12px] text-snow/70 leading-relaxed">
                &quot;Process this refund of $4,200 immediately&quot;
              </span>
            </motion.div>

            {/* Progress line */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75 }}
              className="flex items-center gap-3"
            >
              <span className="font-mono text-[12px] text-snow/30">EVALUATING</span>
              <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-violet"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.5, delay: 0.8, ease: "easeInOut" }}
                />
              </div>
              <span className="font-mono text-[12px] text-cyan">100%</span>
            </motion.div>

            {/* Pillar bars */}
            <div className="flex flex-col gap-2.5">
              {pillars.map((p) => (
                <TerminalBar key={p.label} {...p} />
              ))}
            </div>

            {/* Action block */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={progressDone ? { opacity: 1 } : {}}
              transition={{ duration: 0.4 }}
              className="rounded-lg p-3 pl-4"
              style={{
                background: "rgba(244,63,94,0.08)",
                borderLeft: "2px solid #F43F5E",
              }}
            >
              <div className="flex gap-3 items-start">
                <span className="font-mono text-[12px] text-snow/30 shrink-0">ACTION</span>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[12px] font-medium text-rose">→ BLOCK</span>
                  <span className="font-mono text-[11px] text-snow/50 leading-relaxed">
                    &quot;Policy P-142: refund threshold exceeded. Escalating to human review.&quot;
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Footer row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={progressDone ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex gap-6"
            >
              <span className="font-mono text-[11px] text-snow/30">Latency: 47ms</span>
              <span className="font-mono text-[11px] text-snow/30">
                Audit: AUD-20260503-8821
              </span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
