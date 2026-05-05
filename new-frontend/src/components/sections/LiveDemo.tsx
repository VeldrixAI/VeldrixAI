"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FadeUp from "@/components/animations/FadeUp";

interface PillarResult {
  label: string;
  score: number;
  status: "PASS" | "WARN" | "BLOCK";
}

interface EvalResult {
  pillars: PillarResult[];
  action: "PASS" | "WARN" | "BLOCK";
  reason: string;
  latency: number;
}

const statusColors: Record<string, string> = {
  PASS:  "#10B981",
  WARN:  "#F59E0B",
  BLOCK: "#F43F5E",
};

function computeEval(input: string): EvalResult {
  const lower = input.toLowerCase();

  const hasMassTarget = /all users|all\s+\d+|everyone|50[,\s]?000|mass (email|message|send)/.test(lower);
  const hasDelete = /delete|drop|remove all|wipe|truncat/.test(lower);
  const hasFinancial = /\$[\d,]+|\d+ (dollar|usd|cad)|refund|transfer|payment/.test(lower);
  const hasPII = /ssn|social security|credit card|password|email.*all|phone number/.test(lower);
  const hasSensitive = /confidential|internal|secret|private/.test(lower);

  const pillars: PillarResult[] = [
    {
      label: "Safety & Toxicity",
      score: hasMassTarget ? 72 : hasDelete ? 68 : 95,
      status: (hasMassTarget || hasDelete) ? "WARN" : "PASS",
    },
    {
      label: "Hallucination Risk",
      score: 82,
      status: "PASS",
    },
    {
      label: "Bias & Fairness",
      score: hasMassTarget ? 78 : 94,
      status: hasMassTarget ? "WARN" : "PASS",
    },
    {
      label: "Prompt Security",
      score: hasDelete ? 45 : hasSensitive ? 55 : 88,
      status: hasDelete ? "BLOCK" : hasSensitive ? "WARN" : "PASS",
    },
    {
      label: "Compliance & PII",
      score: hasPII ? 28 : hasMassTarget ? 38 : hasFinancial ? 52 : 90,
      status: hasPII ? "BLOCK" : hasMassTarget ? "BLOCK" : hasFinancial ? "WARN" : "PASS",
    },
  ];

  const worstStatus = pillars.some((p) => p.status === "BLOCK")
    ? "BLOCK"
    : pillars.some((p) => p.status === "WARN")
    ? "WARN"
    : "PASS";

  const reason =
    worstStatus === "BLOCK"
      ? hasMassTarget
        ? "Policy P-119: bulk user targeting prohibited. Requires explicit authorization."
        : hasPII
        ? "Policy P-88: PII exposure detected. Output blocked per data governance rules."
        : "Policy P-142: destructive operation detected. Requires human review."
      : worstStatus === "WARN"
      ? "Output flagged for review. Proceed with caution."
      : "All trust pillars passed. Output approved for delivery.";

  return {
    pillars,
    action: worstStatus,
    reason,
    latency: Math.floor(Math.random() * 20 + 38),
  };
}

const suggestions = [
  "Send an email to all 50,000 users about the outage",
  "Delete all inactive user accounts from the database",
  "What is the capital of France?",
  "Process this refund of $4,200 immediately",
];

export default function LiveDemo() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const evaluate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 1100));
    const evalResult = computeEval(input);
    setResult(evalResult);
    setLoading(false);
  };

  const handleSuggestion = (s: string) => {
    setInput(s);
    setResult(null);
  };

  return (
    <section className="py-24 md:py-28 px-6" id="demo">
      <div className="max-w-7xl mx-auto">
        <FadeUp className="text-center mb-12">
          <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-3">
            Interactive Demo
          </p>
          <h2
            className="font-display font-bold text-white tracking-[-1.5px] mb-4"
            style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
          >
            See It in Action
          </h2>
          <p className="font-body font-light text-[17px] text-snow/50 max-w-md mx-auto">
            Type any prompt and see how VeldrixAI evaluates it across all five trust pillars.
          </p>
        </FadeUp>

        <FadeUp delay={0.15}>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#080c18" }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/6">
              {/* Left: Input */}
              <div className="p-6 md:p-8 flex flex-col gap-5">
                <p className="font-body text-[11px] tracking-[3px] uppercase text-snow/30">
                  Input Prompt
                </p>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) evaluate();
                  }}
                  placeholder='Try: "Send an email to all 50,000 users about the outage"'
                  rows={5}
                  className="w-full bg-transparent font-body font-light text-[15px] text-snow/80 placeholder:text-snow/20 resize-none outline-none leading-relaxed border rounded-lg px-4 py-3 transition-colors duration-200"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                />

                {/* Suggestions */}
                <div className="flex flex-col gap-2">
                  <p className="font-body text-[10px] tracking-[2px] uppercase text-snow/25">
                    Try these
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSuggestion(s)}
                        className="font-body text-[11px] text-snow/40 hover:text-snow/70 px-2.5 py-1 rounded-md border border-white/6 hover:border-white/12 transition-colors duration-200 text-left leading-relaxed"
                      >
                        {s.length > 40 ? s.slice(0, 40) + "…" : s}
                      </button>
                    ))}
                  </div>
                </div>

                <motion.button
                  onClick={evaluate}
                  disabled={loading || !input.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="font-display font-semibold text-[14px] bg-violet text-white px-6 py-3 rounded-lg hover:bg-indigo transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed self-start"
                >
                  {loading ? "Evaluating…" : "Evaluate →"}
                </motion.button>
              </div>

              {/* Right: Result */}
              <div className="p-6 md:p-8 flex flex-col gap-5 min-h-[320px]">
                <p className="font-body text-[11px] tracking-[3px] uppercase text-snow/30">
                  Evaluation Result
                </p>

                <AnimatePresence mode="wait">
                  {!result && !loading && (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex items-center justify-center"
                    >
                      <p className="font-body text-[14px] text-snow/20 text-center leading-relaxed max-w-[200px]">
                        Enter a prompt and click Evaluate to see results
                      </p>
                    </motion.div>
                  )}

                  {loading && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col gap-3 justify-center"
                    >
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="h-2 w-[140px] rounded-full bg-white/4 overflow-hidden">
                            <motion.div
                              className="h-full bg-violet/30 rounded-full"
                              animate={{ x: ["-100%", "100%"] }}
                              transition={{ duration: 1, delay: i * 0.1, repeat: Infinity }}
                            />
                          </div>
                          <div className="h-2 w-12 rounded-full bg-white/4" />
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {result && (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col gap-4"
                    >
                      {/* Pillars */}
                      <div className="flex flex-col gap-2.5">
                        {result.pillars.map((p, i) => (
                          <div key={p.label} className="flex items-center gap-3 text-[12px]">
                            <span className="font-body w-[148px] text-snow/55 shrink-0">{p.label}</span>
                            <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/5">
                              <motion.div
                                className="h-full rounded-full"
                                initial={{ width: "0%" }}
                                animate={{ width: `${p.score}%` }}
                                transition={{ duration: 0.7, delay: i * 0.1, ease: "easeOut" }}
                                style={{
                                  backgroundColor:
                                    p.status === "BLOCK"
                                      ? "#F43F5E"
                                      : p.status === "WARN"
                                      ? "#F59E0B"
                                      : "#7C3AED",
                                }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-cyan w-[44px] text-right shrink-0">
                              {p.score}/100
                            </span>
                            <span
                              className="font-body font-medium text-[10px] tracking-wider w-[38px] shrink-0"
                              style={{ color: statusColors[p.status] }}
                            >
                              {p.status}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Action */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="rounded-lg p-3 pl-4"
                        style={{
                          background:
                            result.action === "BLOCK"
                              ? "rgba(244,63,94,0.08)"
                              : result.action === "WARN"
                              ? "rgba(245,158,11,0.08)"
                              : "rgba(16,185,129,0.08)",
                          borderLeft: `2px solid ${statusColors[result.action]}`,
                        }}
                      >
                        <p
                          className="font-mono text-[11px] font-medium mb-1"
                          style={{ color: statusColors[result.action] }}
                        >
                          → {result.action}
                        </p>
                        <p className="font-mono text-[11px] text-snow/50 leading-relaxed">
                          &quot;{result.reason}&quot;
                        </p>
                      </motion.div>

                      {/* Latency */}
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="font-mono text-[11px] text-snow/25"
                      >
                        Latency: {result.latency}ms
                      </motion.p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
