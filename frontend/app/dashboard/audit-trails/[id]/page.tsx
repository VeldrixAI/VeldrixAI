"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

import EvaluationHeader   from "./components/EvaluationHeader";
import PillarEvidenceStrip from "./components/PillarEvidenceStrip";
import CounterfactualPanel from "./components/CounterfactualPanel";
import MetadataFooter      from "./components/MetadataFooter";

// Heavy visualisations: SSR-off dynamic imports to keep initial bundle small
const TrustConstellation = dynamic(() => import("./components/TrustConstellation"), {
  ssr: false,
  loading: () => <ChartSkeleton h={380} />,
});
const LatencyWaterfall = dynamic(() => import("./components/LatencyWaterfall"), {
  ssr: false,
  loading: () => <ChartSkeleton h={200} />,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type PillarScores = Record<string, number | undefined | null>;

type AuditDetail = {
  id:              string;
  request_id:      string | null;
  log_type:        string;
  action_type:     string;
  verdict:         string | null;
  overall_score:   number | null;
  total_latency_ms: number | null;
  pillar_scores:   PillarScores | null;
  pillar_confidence: Record<string, number> | null;
  per_pillar_ms:   Record<string, number> | null;
  timings_ms:      Record<string, unknown> | null;
  critical_flags:  string[];
  metadata:        Record<string, unknown>;
  actor:           string | null;
  ip_address:      string | null;
  created_at:      string | null;
  entity_type:     string | null;
  budget_tier?:    string;
};

type IntelligenceResult = {
  risk_thesis?: {
    headline:              string;
    severity_level:        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    narrative:             string;
    primary_pillar_at_risk: string;
    risk_pattern:          "ISOLATED" | "RECURRING" | "DRIFT_SIGNAL" | "SYSTEMIC";
  } | null;
  recommendations?: {
    priority: "IMMEDIATE" | "SHORT_TERM" | "MONITORING";
    pillar:   string;
    action:   string;
    rationale: string;
  }[];
  confidence_assessment?: { evaluation_confidence: string; notes: string };
  cached?: boolean;
  error?: boolean;
  error_code?: string;
  message?: string;
  rate_limited?: boolean;
};

type PillarMetric = {
  pillar:     string;
  status:     "ok" | "insufficient_data";
  labeled_n?: number;
  required_n?: number;
  message?:   string;
  f1?:        number;
  precision?: number;
  recall?:    number;
  fpr?:       number;
  precision_ci?: { lower: number; upper: number };
  recall_ci?:    { lower: number; upper: number };
};

type CorrelationData = {
  correlations: Record<string, number | null>;
  n:            number;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveActor(actor: string | null, email: string | null): string | null {
  if (!actor) return null;
  if (UUID_RE.test(actor)) return email || actor.slice(0, 8) + "…";
  return actor;
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW:      "#6fa98f",
  MEDIUM:   "#c2a06a",
  HIGH:     "#be7468",
  CRITICAL: "#be7468",
};

const PATTERN_COLORS: Record<string, string> = {
  ISOLATED:     "#aab8c0",
  RECURRING:    "#c2a06a",
  DRIFT_SIGNAL: "#be7468",
  SYSTEMIC:     "#be7468",
};

const PRIORITY_COLORS: Record<string, string> = {
  IMMEDIATE:  "#be7468",
  SHORT_TERM: "#c2a06a",
  MONITORING: "#aab8c0",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "rgba(45,74,94,0.06)",
      animation: "pulse 1.8s ease-in-out infinite",
    }} />
  );
}

function ChartSkeleton({ h }: { h: number }) {
  return (
    <div style={{
      height: h, borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      animation: "pulse 1.8s ease-in-out infinite",
    }} />
  );
}

function Card({
  children, highlight, style: s,
}: {
  children: React.ReactNode;
  highlight?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background:   "rgba(255,255,255,0.02)",
      border:       "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      backdropFilter: "blur(12px)",
      position:     "relative",
      overflow:     "hidden",
      ...s,
    }}>
      <div style={{
        position:   "absolute",
        top: 0, left: 0, right: 0,
        height: 1,
        background: highlight
          ? `linear-gradient(90deg, transparent, ${highlight}80, transparent)`
          : "linear-gradient(90deg, transparent, rgba(45,74,94,0.5), rgba(170,184,192,0.5), transparent)",
      }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    "DM Sans, sans-serif",
      fontWeight:    500,
      fontSize:      10,
      letterSpacing: "3px",
      textTransform: "uppercase",
      color:         "rgba(231,236,239,0.35)",
      marginBottom:  16,
    }}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily:    "DM Sans, sans-serif",
      fontWeight:    700,
      fontSize:      10,
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color,
      background:    `${color}1a`,
      border:        `1px solid ${color}40`,
      borderRadius:  6,
      padding:       "3px 8px",
      display:       "inline-block",
    }}>
      {label}
    </span>
  );
}

// ── Sections 5 & 6 — Risk Thesis + Policy Trace ───────────────────────────────

// ── Section ML: Diagnostics Panel ────────────────────────────────────────────

const _ML_PILLAR_KEYS   = ["safety", "hallucination", "bias", "prompt_security", "compliance"] as const;
type _MLPillarKey = typeof _ML_PILLAR_KEYS[number];
const _ML_LABELS: Record<_MLPillarKey, string> = {
  safety: "Safety", hallucination: "Hallucination", bias: "Bias",
  prompt_security: "Prompt Security", compliance: "Compliance",
};
const _ML_COLORS: Record<_MLPillarKey, string> = {
  safety: "#be7468", hallucination: "#2d4a5e", bias: "#243b4c",
  prompt_security: "#aab8c0", compliance: "#6fa98f",
};

function _safeDiv(n: number, d: number): number { return d === 0 ? 0 : n / d; }

function MLMetricsPanel({
  pillarScores,
  pillarConf,
  verdict,
  pillarMetrics,
}: {
  pillarScores:  PillarScores;
  pillarConf:    Record<string, number>;
  verdict:       string | null;
  pillarMetrics: Record<string, PillarMetric>;
}) {
  // Operational ground truth: BLOCK/WARN = positive (risky); ALLOW/REVIEW = negative
  const isActuallyRisky = verdict === "BLOCK" || verdict === "WARN";

  const rows = _ML_PILLAR_KEYS.map((p) => {
    const raw = pillarScores[p] ?? null;
    const score = raw !== null ? (raw > 1 ? raw / 100 : raw) : null;
    const conf  = pillarConf[p]  ?? null;
    const predictedRisky = score !== null ? score < 0.5 : null;
    const outcome =
      predictedRisky === null ? null
      : predictedRisky && isActuallyRisky ? "TP"
      : predictedRisky && !isActuallyRisky ? "FP"
      : !predictedRisky && isActuallyRisky ? "FN"
      : "TN";
    const histM = pillarMetrics[p];
    return { p, score, conf, predictedRisky, outcome, histM };
  });

  const counted = rows.filter(r => r.outcome !== null);
  const tp = counted.filter(r => r.outcome === "TP").length;
  const fp = counted.filter(r => r.outcome === "FP").length;
  const fn = counted.filter(r => r.outcome === "FN").length;
  const tn = counted.filter(r => r.outcome === "TN").length;

  const precision    = _safeDiv(tp, tp + fp);
  const recall       = _safeDiv(tp, tp + fn);
  const f1           = _safeDiv(2 * precision * recall, precision + recall);
  const fpr          = _safeDiv(fp, fp + tn);
  const specificity  = _safeDiv(tn, tn + fp);
  const mccNum       = tp * tn - fp * fn;
  const mccDen       = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const mcc          = mccDen > 0 ? mccNum / mccDen : 0;
  const accuracy     = counted.length > 0 ? (tp + tn) / counted.length : 0;

  const hasHistory   = Object.values(pillarMetrics).some(m => m?.status === "ok" && m.f1 != null);

  const verdictColor = verdict === "BLOCK" ? "#be7468"
    : verdict === "WARN"   ? "#c2a06a"
    : verdict === "REVIEW" ? "#aab8c0" : "#6fa98f";

  const outcomeColor: Record<string, string> = {
    TP: "#6fa98f", FP: "#be7468", FN: "#c2a06a", TN: "#6fa98f",
  };
  const outcomeLabel: Record<string, string> = {
    TP: "True Positive",  FP: "False Positive",
    FN: "False Negative", TN: "True Negative",
  };
  const outcomeBg: Record<string, string> = {
    TP: "rgba(111,169,143,0.08)", FP: "rgba(190,116,104,0.08)",
    FN: "rgba(194,160,106,0.08)", TN: "rgba(111,169,143,0.05)",
  };

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <Card style={{ marginBottom: 20, padding: 28 }} highlight="#aab8c0">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <SectionLabel>ML Diagnostics</SectionLabel>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.35)", marginTop: -8 }}>
            Evaluation-scope confusion matrix · {verdict ? <span style={{ color: verdictColor, fontWeight: 600 }}>{verdict}</span> : "No verdict"} as ground truth
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9, letterSpacing: "1.5px",
            padding: "3px 8px", borderRadius: 6,
            background: "rgba(170,184,192,0.1)", border: "1px solid rgba(170,184,192,0.25)", color: "#aab8c0",
          }}>
            {hasHistory ? "HISTORICAL + LIVE" : "EVALUATION-SCOPE"}
          </span>
        </div>
      </div>

      {/* Two-column: Confusion Matrix + Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

        {/* Confusion Matrix */}
        <div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)", marginBottom: 12 }}>
            Confusion Matrix <span style={{ color: "rgba(231,236,239,0.15)" }}>· pillar × verdict</span>
          </div>

          {/* Labels header */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: 4, marginBottom: 4 }}>
            <div />
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.3)", textAlign: "center" }}>Actual +</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.3)", textAlign: "center" }}>Actual −</div>
          </div>
          {/* Row: Predicted + */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: 4, marginBottom: 4 }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(231,236,239,0.3)", display: "flex", alignItems: "center" }}>Predicted +</div>
            {/* TP */}
            <div style={{ padding: "14px 10px", borderRadius: 10, background: outcomeBg.TP, border: "1px solid rgba(111,169,143,0.2)", textAlign: "center" }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, color: "#6fa98f", lineHeight: 1 }}>{tp}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(111,169,143,0.6)", marginTop: 4, letterSpacing: "1px" }}>TP</div>
            </div>
            {/* FP */}
            <div style={{ padding: "14px 10px", borderRadius: 10, background: outcomeBg.FP, border: "1px solid rgba(190,116,104,0.2)", textAlign: "center" }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, color: "#be7468", lineHeight: 1 }}>{fp}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(190,116,104,0.6)", marginTop: 4, letterSpacing: "1px" }}>FP</div>
            </div>
          </div>
          {/* Row: Predicted − */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: 4 }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(231,236,239,0.3)", display: "flex", alignItems: "center" }}>Predicted −</div>
            {/* FN */}
            <div style={{ padding: "14px 10px", borderRadius: 10, background: outcomeBg.FN, border: "1px solid rgba(194,160,106,0.2)", textAlign: "center" }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, color: "#c2a06a", lineHeight: 1 }}>{fn}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(194,160,106,0.6)", marginTop: 4, letterSpacing: "1px" }}>FN</div>
            </div>
            {/* TN */}
            <div style={{ padding: "14px 10px", borderRadius: 10, background: outcomeBg.TN, border: "1px solid rgba(111,169,143,0.15)", textAlign: "center" }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, color: "#6fa98f", lineHeight: 1 }}>{tn}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "rgba(111,169,143,0.6)", marginTop: 4, letterSpacing: "1px" }}>TN</div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["TP", "FP", "FN", "TN"] as const).map(k => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: outcomeColor[k] }} />
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, color: "rgba(231,236,239,0.3)" }}>{outcomeLabel[k]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)", marginBottom: 12 }}>
            Classification Metrics
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "F1 Score",     value: f1,          fmt: fmtPct, color: f1 >= 0.8 ? "#6fa98f" : f1 >= 0.6 ? "#c2a06a" : "#be7468", desc: "Harmonic mean of precision & recall" },
              { label: "Precision",    value: precision,   fmt: fmtPct, color: precision >= 0.8 ? "#6fa98f" : "#c2a06a",  desc: "Flagged correctly / all flagged" },
              { label: "Recall",       value: recall,      fmt: fmtPct, color: recall >= 0.8 ? "#6fa98f" : "#c2a06a",     desc: "Caught / all actual violations" },
              { label: "Specificity",  value: specificity, fmt: fmtPct, color: specificity >= 0.8 ? "#6fa98f" : "#c2a06a",desc: "Correctly cleared / all safe" },
              { label: "FPR",          value: fpr,         fmt: fmtPct, color: fpr <= 0.1 ? "#6fa98f" : fpr <= 0.3 ? "#c2a06a" : "#be7468", desc: "False alarm rate" },
              { label: "MCC",          value: mcc,         fmt: (v: number) => v.toFixed(3), color: mcc >= 0.6 ? "#6fa98f" : mcc >= 0.3 ? "#c2a06a" : "rgba(231,236,239,0.5)", desc: "Matthews correlation coefficient" },
              { label: "Accuracy",     value: accuracy,    fmt: fmtPct, color: accuracy >= 0.8 ? "#6fa98f" : "#c2a06a",  desc: "Overall correct decisions" },
            ].map(({ label, value, fmt, color, desc }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                <div>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.7)", fontWeight: 500 }}>{label}</div>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, color: "rgba(231,236,239,0.2)", marginTop: 1 }}>{desc}</div>
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 15, fontWeight: 700, color }}>{fmt(value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-Pillar Signal Table */}
      <div>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)", marginBottom: 12 }}>
          Per-Pillar Signal
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
            <thead>
              <tr>
                {["Pillar", "Score", "Confidence", "Prediction", "Outcome", "Historical F1"].map(col => (
                  <th key={col} style={{ padding: "8px 12px", fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(231,236,239,0.25)", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, score, conf, predictedRisky, outcome, histM }) => {
                const color = _ML_COLORS[p as _MLPillarKey];
                const outC  = outcome ? outcomeColor[outcome] : "rgba(231,236,239,0.25)";
                return (
                  <tr key={p} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.7)" }}>{_ML_LABELS[p as _MLPillarKey]}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 40, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: score !== null ? `${score * 100}%` : "0%", height: "100%", background: score !== null && score >= 0.5 ? "#6fa98f" : "#be7468", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: score !== null && score >= 0.5 ? "#6fa98f" : "#be7468" }}>
                          {score !== null ? `${(score * 100).toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(231,236,239,0.5)" }}>
                      {conf !== null ? `${(conf * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase",
                        padding: "2px 7px", borderRadius: 5,
                        background: predictedRisky === null ? "rgba(255,255,255,0.04)" : predictedRisky ? "rgba(190,116,104,0.1)" : "rgba(111,169,143,0.1)",
                        border: `1px solid ${predictedRisky === null ? "rgba(255,255,255,0.08)" : predictedRisky ? "rgba(190,116,104,0.3)" : "rgba(111,169,143,0.3)"}`,
                        color: predictedRisky === null ? "rgba(231,236,239,0.3)" : predictedRisky ? "#be7468" : "#6fa98f",
                      }}>
                        {predictedRisky === null ? "—" : predictedRisky ? "RISKY" : "SAFE"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {outcome ? (
                        <span style={{
                          fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 11,
                          color: outC, background: `${outC}15`,
                          border: `1px solid ${outC}35`, borderRadius: 5, padding: "2px 7px",
                        }}>
                          {outcome}
                        </span>
                      ) : <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(231,236,239,0.2)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {histM?.status === "ok" && histM.f1 != null ? (
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: histM.f1 >= 0.8 ? "#6fa98f" : "#c2a06a", fontWeight: 600 }}>
                          {histM.f1.toFixed(3)}
                        </span>
                      ) : (
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(231,236,239,0.2)" }}>
                          {histM?.labeled_n != null ? `n=${histM.labeled_n} / ${histM.required_n ?? 30}` : "pending"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Calibration Status */}
        {!hasHistory && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(45,74,94,0.04)", border: "1px solid rgba(45,74,94,0.12)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(45,74,94,0.6)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.5)", fontWeight: 500 }}>
                Historical F1 calibration unlocks at 30+ labeled evaluations per pillar
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "rgba(231,236,239,0.25)", marginTop: 2 }}>
                Evaluation-scope metrics above are computed from pillar predictions vs {verdict ?? "verdict"} as operational ground truth
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RiskThesisSection({ intel, loading, error }: {
  intel:        IntelligenceResult | null;
  loading:      boolean;
  error:        string;
}) {
  const systemPattern = intel?.risk_thesis?.risk_pattern;
  return (
    <Card style={{ marginBottom: 20, padding: 28 }} highlight="#2d4a5e">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <SectionLabel>AI Risk Thesis</SectionLabel>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(45,74,94,0.6)", letterSpacing: "1px" }}>
          {intel?.cached ? "CACHED" : "GROQ-POWERED"}
        </span>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(45,74,94,0.6)", animation: "pulse 1.8s ease-in-out infinite" }}>
            ⬡ Generating forensic intelligence via Groq…
          </div>
          <Skeleton h={18} w="70%" />
          <Skeleton h={80} />
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "12px 16px", background: "rgba(190,116,104,0.08)", border: "1px solid rgba(190,116,104,0.2)", borderRadius: 10, color: "#be7468", fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && intel?.error && (() => {
        const isCfg = intel.error_code === "GROQ_ERROR" && (intel.message ?? "").toLowerCase().includes("not configured");
        return (
          <div style={{
            padding: "14px 16px",
            background: isCfg ? "rgba(194,160,106,0.07)" : "rgba(190,116,104,0.07)",
            border: `1px solid ${isCfg ? "rgba(194,160,106,0.25)" : "rgba(190,116,104,0.2)"}`,
            borderRadius: 10,
          }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: isCfg ? "#c2a06a" : "#be7468" }}>
              {isCfg ? "AI Analysis Not Configured" : "AI Analysis Unavailable"}
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.5)", lineHeight: 1.6, marginTop: 4 }}>
              {isCfg
                ? "Set a real GROQ_API_KEY in backend/.env (free at console.groq.com) to enable forensic AI analysis."
                : intel.message || "Intelligence generation failed. Try regenerating."}
            </div>
          </div>
        );
      })()}

      {!loading && intel?.risk_thesis && (
        <div>
          <div style={{
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 20,
            background: "linear-gradient(135deg, #2d4a5e, #aab8c0)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", marginBottom: 16, lineHeight: 1.3,
          }}>
            {intel.risk_thesis.headline}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <Badge
              label={`Severity: ${intel.risk_thesis.severity_level}`}
              color={SEVERITY_COLORS[intel.risk_thesis.severity_level] || "#aab8c0"}
            />
            <span style={{
              fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 10,
              letterSpacing: "1.5px", textTransform: "uppercase",
              color: PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#aab8c0",
              background: `${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#aab8c0"}1a`,
              border: `1px solid ${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#aab8c0"}40`,
              borderRadius: 6, padding: "3px 8px", display: "inline-block",
              animation: systemPattern === "SYSTEMIC" ? "systemic-pulse 2s ease-in-out infinite" : "none",
            }}>
              Pattern: {intel.risk_thesis.risk_pattern}
            </span>
          </div>

          <div style={{
            fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 14,
            lineHeight: 1.8, color: "rgba(231,236,239,0.72)", whiteSpace: "pre-wrap",
          }}>
            {intel.risk_thesis.narrative}
          </div>

          {intel.confidence_assessment && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(231,236,239,0.35)" }}>
                Confidence: <span style={{ color: "rgba(231,236,239,0.6)" }}>{intel.confidence_assessment.evaluation_confidence}</span>
                {intel.confidence_assessment.notes && ` — ${intel.confidence_assessment.notes}`}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PolicyTraceSection({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <Card style={{ marginBottom: 20, padding: 28 }}>
      <SectionLabel>Policy Trace — Flags Triggered</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {flags.map((f, i) => (
          <div key={i} style={{
            display:    "flex",
            alignItems: "center",
            gap:        8,
            padding:    "8px 14px",
            background: "rgba(190,116,104,0.06)",
            border:     "1px solid rgba(190,116,104,0.2)",
            borderLeft: "3px solid #be7468",
            borderRadius: "0 10px 10px 0",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#be7468" }} />
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 11,
              color: "#be7468",
            }}>
              {f}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecommendationsSection({ recs }: { recs: NonNullable<IntelligenceResult["recommendations"]> }) {
  if (!recs.length) return null;
  const sorted = [...recs].sort((a, b) => {
    const order = { IMMEDIATE: 0, SHORT_TERM: 1, MONITORING: 2 };
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
  });
  return (
    <Card style={{ marginBottom: 20, padding: 28 }}>
      <SectionLabel>Recommendations</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((rec, i) => {
          const pColor = PRIORITY_COLORS[rec.priority] || "#aab8c0";
          return (
            <div key={i} style={{
              padding:    "16px 18px",
              background: "rgba(255,255,255,0.02)",
              border:     "1px solid rgba(255,255,255,0.06)",
              borderLeft: `3px solid ${pColor}`,
              borderRadius: "0 12px 12px 0",
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <Badge label={rec.priority === "SHORT_TERM" ? "SHORT TERM" : rec.priority} color={pColor} />
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "rgba(231,236,239,0.35)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {rec.pillar}
                </span>
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: 14, color: "#e7ecef", marginBottom: 4 }}>
                {rec.action}
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 13, color: "rgba(231,236,239,0.5)", lineHeight: 1.6 }}>
                {rec.rationale}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditDetailPage() {
  const params    = useParams();
  const requestId = params?.id as string;

  const [detail,       setDetail]       = useState<AuditDetail | null>(null);
  const [detailLoading,setDetailLoading]= useState(true);
  const [detailError,  setDetailError]  = useState("");

  const [intel,        setIntel]        = useState<IntelligenceResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError,   setIntelError]   = useState("");

  const [metrics,      setMetrics]      = useState<Record<string, PillarMetric>>({});
  const [correlations, setCorrelations] = useState<CorrelationData | null>(null);

  const [generatingPdf,setGeneratingPdf]= useState(false);
  const [toasts,       setToasts]       = useState<{ id: number; msg: string; type: string }[]>([]);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u?.email) setCurrentEmail(u.email); })
      .catch(() => {});
  }, []);

  // Load audit detail
  useEffect(() => {
    if (!requestId) return;
    setDetailLoading(true);
    fetch(`/api/audit-trails/${requestId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setDetail(d);
      })
      .catch(e => setDetailError(e.message || "Failed to load"))
      .finally(() => setDetailLoading(false));
  }, [requestId]);

  // Load intelligence after detail is ready
  const loadIntelligence = useCallback(async (force = false) => {
    if (!requestId) return;
    setIntelLoading(true);
    setIntelError("");
    try {
      const qs  = force ? "?force_refresh=true" : "";
      const res = await fetch(`/api/audit-trails/${requestId}/intelligence${qs}`, { method: "POST" });
      setIntel(await res.json());
    } catch (e) {
      setIntelError(e instanceof Error ? e.message : "Intelligence load failed");
    } finally {
      setIntelLoading(false);
    }
  }, [requestId]);

  useEffect(() => { if (detail) loadIntelligence(); }, [detail?.id]);

  // Load pillar metrics
  useEffect(() => {
    fetch("/api/metrics?endpoint=pillars&window=7d")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.pillars) return;
        const map: Record<string, PillarMetric> = {};
        for (const m of d.pillars) map[m.pillar] = m;
        setMetrics(map);
      })
      .catch(() => {});
  }, []);

  // Load correlations for constellation edges
  useEffect(() => {
    fetch("/api/metrics?endpoint=correlations&window=30d")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.correlations) setCorrelations(d); })
      .catch(() => {});
  }, []);

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }

  async function handleCreateReport() {
    if (!detail) return;
    setGeneratingPdf(true);
    try {
      const meta = detail.metadata;
      const res = await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Evaluation — ${(detail.request_id || detail.id).slice(0, 8)} — ${new Date(detail.created_at || "").toISOString().slice(0, 10)}`,
          report_type: "trust_evaluation",
          input_payload: { ...meta, request_id: detail.request_id },
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "PDF failed"); }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `veldrix-trust-${(detail.request_id || detail.id).slice(0, 8)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      showToast("Report created and downloaded");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Report creation failed", "error");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Derived data
  const pillarScores:  PillarScores            = detail?.pillar_scores   ?? {};
  const pillarConf:    Record<string, number>   = detail?.pillar_confidence ?? {};
  const perPillarMs:   Record<string, number>   = detail?.per_pillar_ms  ?? {};
  const timingsMs                               = detail?.timings_ms ?? null;
  const flags:         string[]                 = detail?.critical_flags ?? [];
  const verdict                                 = detail?.verdict ?? null;
  const totalLatencyMs                          = detail?.total_latency_ms ?? null;
  const metaRaw                                 = detail?.metadata ?? {};
  const promptPreview  = metaRaw.prompt_preview  as string | undefined;
  const responsePreview= metaRaw.response_preview as string | undefined;
  const sdkVersion     = metaRaw.sdk_version     as string | undefined;
  const budgetTier     = metaRaw.budget_tier      as string | undefined ?? detail?.budget_tier;

  const trustScore = detail?.overall_score ?? null;

  const correlationMap: Record<string, number | null> = correlations?.correlations ?? {};

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes systemic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(190,116,104,0)} 50%{box-shadow:0 0 0 6px rgba(190,116,104,0.25)} }
      `}</style>

      <div style={{ padding: "32px", flex: 1, overflowY: "auto" }}>

        {/* ── Nav bar ── */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link href="/dashboard/audit-trails" style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13,
            color: "rgba(231,236,239,0.4)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Audit Trail
          </Link>
          <button
            onClick={handleCreateReport}
            disabled={generatingPdf || detailLoading}
            style={{
              padding: "10px 18px",
              background: "rgba(45,74,94,0.12)",
              border: "1px solid rgba(45,74,94,0.3)",
              borderRadius: 12, color: "#2d4a5e",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 600, fontSize: 13,
              cursor: generatingPdf ? "wait" : "pointer",
              opacity: detailLoading ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {generatingPdf ? "Generating…" : "Create Report"}
          </button>
        </div>

        {detailError && (
          <div style={{ padding: "12px 16px", background: "rgba(190,116,104,0.08)", border: "1px solid rgba(190,116,104,0.2)", borderRadius: 12, color: "#be7468", fontFamily: "DM Sans, sans-serif", fontSize: 13, marginBottom: 24 }}>
            {detailError}
          </div>
        )}

        {/* ── Section 1: Evaluation Header Strip ── */}
        {detailLoading ? (
          <div style={{ height: 64, marginBottom: 20, borderRadius: 16, background: "rgba(255,255,255,0.015)", animation: "pulse 1.8s ease-in-out infinite" }} />
        ) : (
          <EvaluationHeader
            requestId={detail?.request_id ?? null}
            createdAt={detail?.created_at ?? null}
            verdict={verdict}
            totalLatencyMs={totalLatencyMs}
            perPillarMs={perPillarMs}
            orgP95Ms={500}
            provider={metaRaw.provider as string | undefined}
            budgetTier={budgetTier}
          />
        )}

        {/* ── Section 2: Trust Constellation ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <SectionLabel>Trust Constellation</SectionLabel>
          {detailLoading ? (
            <ChartSkeleton h={380} />
          ) : (
            <TrustConstellation
              pillarScores={pillarScores}
              pillarConf={pillarConf}
              pillarMetrics={metrics}
              correlations={correlationMap}
              trustScore={trustScore}
              verdict={verdict}
            />
          )}
        </Card>

        {/* ── Section 3: Per-Pillar Evidence Strip ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <SectionLabel>Pillar Evidence Strip</SectionLabel>
          {detailLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1,2,3,4,5].map(i => <Skeleton key={i} h={74} />)}
            </div>
          ) : (
            <PillarEvidenceStrip
              pillarScores={pillarScores}
              pillarConf={pillarConf}
              perPillarMs={perPillarMs}
              pillarMetrics={metrics}
              flags={flags}
            />
          )}
        </Card>

        {/* ── Section 3.5: ML Diagnostics ── */}
        {!detailLoading && (
          <MLMetricsPanel
            pillarScores={pillarScores}
            pillarConf={pillarConf}
            verdict={verdict}
            pillarMetrics={metrics}
          />
        )}

        {/* ── Section 4: Latency Waterfall ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <SectionLabel>Latency Waterfall</SectionLabel>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(231,236,239,0.25)" }}>
              p95 budget = 500ms
            </span>
          </div>
          {detailLoading ? (
            <ChartSkeleton h={200} />
          ) : (
            <LatencyWaterfall
              timingsMs={timingsMs as Record<string, unknown> | null}
              totalLatencyMs={totalLatencyMs}
              perPillarMs={perPillarMs}
              p95BudgetMs={500}
            />
          )}
        </Card>

        {/* ── Section 5: AI Risk Thesis (Reasoning Trace) ── */}
        <RiskThesisSection
          intel={intel}
          loading={intelLoading}
          error={intelError}
        />

        {/* ── Section 5b: Recommendations ── */}
        <RecommendationsSection recs={intel?.recommendations ?? []} />

        {/* ── Section 6: Policy Trace ── */}
        <PolicyTraceSection flags={flags} />

        {/* ── Section 7: Counterfactual Panel ── */}
        {!detailLoading && (promptPreview || responsePreview) && (
          <Card style={{ marginBottom: 20, padding: 28 }}>
            <SectionLabel>Counterfactual — What If?</SectionLabel>
            <CounterfactualPanel
              originalPrompt={promptPreview ?? ""}
              originalResponse={responsePreview ?? ""}
              originalVerdict={verdict}
              originalScore={trustScore}
            />
          </Card>
        )}

        {/* ── Section 8: Metadata Footer ── */}
        {!detailLoading && detail && (
          <div style={{ marginBottom: 24 }}>
            <MetadataFooter
              id={detail.id}
              requestId={detail.request_id}
              createdAt={detail.created_at}
              actor={resolveActor(detail.actor, currentEmail)}
              ipAddress={detail.ip_address}
              logType={detail.log_type}
              entityType={detail.entity_type}
              sdkVersion={sdkVersion}
              budgetTier={budgetTier}
              metadata={metaRaw}
            />
          </div>
        )}

        {/* ── Append-only notice (audit records are immutable & tamper-evident) ── */}
        {!detailLoading && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <div
              style={{
                padding:    "8px 14px",
                background: "rgba(170,184,192,0.05)",
                border:     "1px solid rgba(170,184,192,0.15)",
                borderRadius: 12, color: "rgba(231,236,239,0.45)",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 500, fontSize: 12,
                display:    "flex", alignItems: "center", gap: 8,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Append-only record — immutable &amp; hash-chained
            </div>
          </div>
        )}
      </div>

      {/* ── Toast notifications ── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 10, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding:    "12px 18px",
            background: t.type === "error" ? "rgba(190,116,104,0.12)" : "rgba(111,169,143,0.12)",
            border:     `1px solid ${t.type === "error" ? "rgba(190,116,104,0.3)" : "rgba(111,169,143,0.3)"}`,
            borderRadius: 12,
            color:      t.type === "error" ? "#be7468" : "#6fa98f",
            fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 500,
            maxWidth:   360, backdropFilter: "blur(8px)",
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}
