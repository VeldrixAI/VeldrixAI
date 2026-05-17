"use client";

import { useState, useEffect, useRef } from "react";

const PILLAR_KEYS   = ["safety", "hallucination", "bias", "prompt_security", "compliance"] as const;
type PillarKey = typeof PILLAR_KEYS[number];

const PILLAR_LABELS: Record<PillarKey, string> = {
  safety:          "Safety & Toxicity",
  hallucination:   "Hallucination",
  bias:            "Bias & Fairness",
  prompt_security: "Prompt Security",
  compliance:      "Compliance & PII",
};

const PILLAR_COLORS: Record<PillarKey, string> = {
  safety:          "#F43F5E",
  hallucination:   "#7C3AED",
  bias:            "#4F46E5",
  prompt_security: "#06B6D4",
  compliance:      "#10B981",
};

// SVG pillar icons — 28×28, single-stroke
const PILLAR_ICONS: Record<PillarKey, React.ReactNode> = {
  safety: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  hallucination: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  ),
  bias: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  prompt_security: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  compliance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="11" y2="11"/>
    </svg>
  ),
};

interface PillarMetric {
  status:    "ok" | "insufficient_data";
  labeled_n?: number;
  required_n?: number;
  f1?:        number;
  precision?: number;
  recall?:    number;
  fpr?:       number;
  precision_ci?: { lower: number; upper: number };
  recall_ci?:    { lower: number; upper: number };
}

interface Props {
  pillarScores:    Record<string, number | null | undefined>;
  pillarConf:      Record<string, number | null | undefined>;
  perPillarMs:     Record<string, number>;
  pillarMetrics:   Record<string, PillarMetric>;
  flags:           string[];
}

function getSeverity(score: number): { label: string; color: string } {
  const risk = 1 - score;
  if (risk < 0.2) return { label: "CLEAN",    color: "#10B981" };
  if (risk < 0.4) return { label: "LOW",      color: "#10B981" };
  if (risk < 0.6) return { label: "MEDIUM",   color: "#f59e0b" };
  if (risk < 0.8) return { label: "HIGH",     color: "#F43F5E" };
  return             { label: "CRITICAL",     color: "#F43F5E" };
}

function ConfidenceBar({ value, color, delay }: { value: number; color: string; delay: number }) {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setWidth(Math.round(value * 100)); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={ref}
      style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}
    >
      <div
        style={{
          width:        `${width}%`,
          height:       "100%",
          borderRadius: 3,
          background:   color,
          transition:   `width 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        }}
      />
    </div>
  );
}

function MetricsFooter({ m, pillar }: { m: PillarMetric | undefined; pillar: string }) {
  if (!m) return null;

  if (m.status === "insufficient_data") {
    return (
      <div style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: 10,
        color: "rgba(244,63,94,0.5)", marginTop: 6, letterSpacing: "0.3px",
      }}>
        n={m.labeled_n ?? 0} · insufficient labeled data (need ≥{m.required_n ?? 30})
      </div>
    );
  }

  if (m.status === "ok" && m.f1 != null) {
    const ciLow  = m.precision_ci?.lower ?? null;
    const ciHigh = m.precision_ci?.upper ?? null;
    return (
      <div style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: 10,
        color: "rgba(240,242,255,0.3)", marginTop: 6, letterSpacing: "0.3px",
        display: "flex", gap: 8, flexWrap: "wrap",
      }}>
        <span>F1 {m.f1.toFixed(2)}</span>
        {ciLow != null && ciHigh != null && (
          <span style={{ color: "rgba(240,242,255,0.18)" }}>
            ±{((ciHigh - ciLow) / 2).toFixed(2)}
          </span>
        )}
        <span>·</span>
        <span>P {m.precision?.toFixed(2) ?? "—"}</span>
        <span>·</span>
        <span>R {m.recall?.toFixed(2) ?? "—"}</span>
        <span>·</span>
        <span>FPR {m.fpr != null ? `${(m.fpr * 100).toFixed(1)}%` : "—"}</span>
        <span>·</span>
        <span style={{ color: "rgba(240,242,255,0.2)" }}>
          n={m.labeled_n?.toLocaleString() ?? "—"}
        </span>
      </div>
    );
  }

  return null;
}

export default function PillarEvidenceStrip({
  pillarScores,
  pillarConf,
  perPillarMs,
  pillarMetrics,
  flags,
}: Props) {
  const [expanded, setExpanded] = useState<PillarKey | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {PILLAR_KEYS.map((pillar, idx) => {
        // Scores come as 0-1, convert to 0-100 for display
        const rawScore  = pillarScores[pillar] ?? null;
        const score     = rawScore != null ? (rawScore > 1 ? rawScore : rawScore * 100) : null;
        const rawConf   = pillarConf[pillar]   ?? null;
        const conf      = rawConf != null ? (rawConf > 1 ? rawConf : rawConf * 100) : null;
        const latencyMs = perPillarMs[pillar]  ?? null;
        const metric    = pillarMetrics[pillar];
        const color     = PILLAR_COLORS[pillar];
        // For severity, use the 0-1 scale
        const sev       = rawScore != null ? getSeverity(rawScore > 1 ? rawScore / 100 : rawScore) : { label: "N/A", color: "rgba(240,242,255,0.25)" };
        const isExpanded = expanded === pillar;
        const pillarFlags = flags.filter(f => f.toLowerCase().includes(pillar) || f.toLowerCase().includes("all"));

        return (
          <div
            key={pillar}
            style={{
              background:    "rgba(255,255,255,0.02)",
              border:        `1px solid ${isExpanded ? `${color}30` : "rgba(255,255,255,0.06)"}`,
              borderLeft:    `3px solid ${isExpanded ? color : "rgba(255,255,255,0.08)"}`,
              borderRadius:  "0 12px 12px 0",
              overflow:      "hidden",
              transition:    "border-color 0.2s",
              cursor:        "pointer",
            }}
            onClick={() => setExpanded(isExpanded ? null : pillar)}
          >
            {/* Main row */}
            <div style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                {/* Icon */}
                <div style={{ color, flexShrink: 0 }}>
                  {PILLAR_ICONS[pillar]}
                </div>

                {/* Name + verdict */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "DM Sans, sans-serif", fontWeight: 600,
                    fontSize: 13, color: "rgba(240,242,255,0.85)",
                  }}>
                    {PILLAR_LABELS[pillar]}
                  </div>
                </div>

                {/* Verdict badge */}
                <span style={{
                  fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 9,
                  letterSpacing: "1.5px", textTransform: "uppercase",
                  color: sev.color, background: `${sev.color}1a`,
                  border: `1px solid ${sev.color}40`,
                  borderRadius: 6, padding: "2px 7px",
                }}>
                  {sev.label}
                </span>

                {/* Latency */}
                {latencyMs != null && (
                  <span style={{
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                    color: "rgba(240,242,255,0.3)", flexShrink: 0,
                  }}>
                    {latencyMs}ms
                  </span>
                )}

                {/* Expand chevron */}
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(240,242,255,0.3)" strokeWidth="2"
                  style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* Confidence bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConfidenceBar
                  value={score != null ? score / 100 : 0}
                  color={color}
                  delay={idx * 100}
                />
                <span style={{
                  fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                  color, minWidth: 36, textAlign: "right",
                }}>
                  {score != null ? score.toFixed(1) : "—"}
                </span>
              </div>

              {/* Accuracy footer */}
              <MetricsFooter m={metric} pillar={pillar} />
            </div>

            {/* Expanded evidence panel */}
            {isExpanded && (
              <div
                style={{
                  padding:    "14px 18px",
                  borderTop:  `1px solid ${color}20`,
                  background: "rgba(0,0,0,0.15)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {pillarFlags.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      fontFamily: "DM Sans, sans-serif", fontSize: 10,
                      letterSpacing: "2px", textTransform: "uppercase",
                      color: "rgba(240,242,255,0.25)", marginBottom: 6,
                    }}>
                      Flags Triggered
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {pillarFlags.map((flag, i) => (
                        <span key={i} style={{
                          fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                          color, background: `${color}12`,
                          border: `1px solid ${color}30`, borderRadius: 5,
                          padding: "2px 7px",
                        }}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                  <StatItem label="Trust Score"  value={score != null ? `${score.toFixed(1)}%` : "—"} color={color} />
                  <StatItem label="Confidence"   value={conf  != null ? `${conf.toFixed(1)}%`  : "—"} color={color} />
                  <StatItem label="Latency"      value={latencyMs != null ? `${latencyMs}ms` : "—"} />
                </div>

                {(!pillarFlags.length) && (
                  <div style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 12,
                    color: "rgba(240,242,255,0.25)", marginTop: 8, lineHeight: 1.6,
                  }}>
                    This pillar fired on aggregate signals, not specific flagged spans.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 9,
        letterSpacing: "2px", textTransform: "uppercase",
        color: "rgba(240,242,255,0.25)", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "JetBrains Mono, monospace", fontSize: 12,
        color: color ?? "rgba(240,242,255,0.65)",
      }}>
        {value}
      </div>
    </div>
  );
}
