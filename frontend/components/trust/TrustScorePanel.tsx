"use client";

/**
 * TrustScorePanel — Live five-pillar trust breakdown widget.
 *
 * Renders on the Dashboard whenever an AnalysisResult arrives via SSE
 * or a direct analyzeRequest() call.
 *
 * Brand tokens (must not deviate):
 *   bg       #050810   void background
 *   violet   #7C3AED   primary accent
 *   indigo   #4F46E5   secondary accent
 *   cyan     #06B6D4   highlight
 *   emerald  #10B981   success
 *   rose     #F43F5E   critical / error
 *   amber    #F59E0B   warning
 *   Font display: Syne 800  |  Body: DM Sans 300/400/500
 */

import React from "react";
import { AnalysisResult, PillarResult } from "@/lib/veldrix-api";

// ── Brand constants ────────────────────────────────────────────────────────────
const PILLAR_META: Record<string, { label: string; icon: string }> = {
  safety:          { label: "Safety & Toxicity",   icon: "⬡" },
  hallucination:   { label: "Hallucination",        icon: "◈" },
  bias:            { label: "Bias & Fairness",      icon: "⬟" },
  prompt_security: { label: "Prompt Security",      icon: "⬡" },
  compliance:      { label: "Compliance & PII",     icon: "◉" },
};

const VERDICT_STYLE: Record<string, { color: string; glow: string }> = {
  ALLOW:  { color: "#10b981", glow: "rgba(16,185,129,0.35)"  },
  WARN:   { color: "#f59e0b", glow: "rgba(245,158,11,0.35)"  },
  REVIEW: { color: "#06b6d4", glow: "rgba(6,182,212,0.35)"   },
  BLOCK:  { color: "#f43f5e", glow: "rgba(244,63,94,0.40)"   },
};

function scoreColor(score: number | null, isError: boolean): string {
  if (isError || score === null) return "#f43f5e";
  if (score >= 0.85) return "#10b981";
  if (score >= 0.60) return "#f59e0b";
  return "#f43f5e";
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  const pct = Math.round(score * 100);
  return (
    <div style={{
      position: "relative", height: 4,
      background: "rgba(255,255,255,0.07)",
      borderRadius: 2, overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        borderRadius: 2,
        transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
        boxShadow: `0 0 8px ${color}66`,
      }} />
    </div>
  );
}

// ── PillarCard ────────────────────────────────────────────────────────────────
function PillarCard({ pillar, result }: { pillar: string; result: PillarResult }) {
  const meta    = PILLAR_META[pillar] ?? { label: pillar, icon: "◆" };
  const score   = result.score ?? 0;
  const pct     = Math.round(score * 100);
  const isError = result.status === "error";
  const color   = scoreColor(result.score, isError);

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderTop: `2px solid ${color}55`,
      borderRadius: 16,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      backdropFilter: "blur(12px)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, opacity: 0.6, fontFamily: "monospace" }}>{meta.icon}</span>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            fontSize: 12, letterSpacing: "0.08em",
            color: "rgba(240,242,255,0.65)",
          }}>
            {meta.label.toUpperCase()}
          </span>
        </div>
        <span style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800,
          fontSize: 20, color: isError ? "#f43f5e" : "rgba(240,242,255,0.92)",
          letterSpacing: "-0.5px",
        }}>
          {isError ? "ERR" : pct}
          {!isError && (
            <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(240,242,255,0.3)", marginLeft: 2 }}>%</span>
          )}
        </span>
      </div>

      {/* Score bar */}
      <ScoreBar score={score} color={color} />

      {/* Latency + flags */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 10,
          color: "rgba(240,242,255,0.25)", letterSpacing: "0.05em",
        }}>
          {result.latency_ms != null ? `${result.latency_ms}ms` : "—"}
        </span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(result.flags ?? []).slice(0, 2).map((f) => (
            <span key={f} style={{
              background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.3)",
              borderRadius: 4, padding: "1px 7px",
              fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.1em",
              color: "#f43f5e", textTransform: "uppercase",
            }}>
              {f.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {result.error && (
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 10,
          color: "rgba(244,63,94,0.5)", fontStyle: "italic",
        }}>
          {result.error.slice(0, 80)}
        </div>
      )}
    </div>
  );
}

// ── TrustScorePanel ───────────────────────────────────────────────────────────
interface Props {
  result?:  AnalysisResult | null;
  loading?: boolean;
}

export function TrustScorePanel({ result, loading }: Props) {
  const ts     = result?.trust_score;
  const pct    = ts ? Math.round(ts.overall * 100) : null;
  const vStyle = ts ? (VERDICT_STYLE[ts.verdict] ?? VERDICT_STYLE.REVIEW) : null;

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 24,
      padding: "32px 36px",
      backdropFilter: "blur(20px)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Top gradient line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent, #7c3aed88, #06b6d488, transparent)",
      }} />

      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 28,
      }}>
        <div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
            color: "rgba(240,242,255,0.28)", marginBottom: 4,
          }}>
            Trust Evaluation
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            fontSize: 18, color: "rgba(240,242,255,0.9)",
          }}>
            Five-Pillar Analysis
          </div>
        </div>

        {/* Aggregate score + verdict badge */}
        {ts && vStyle && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 800,
                fontSize: 36, letterSpacing: "-1.5px", lineHeight: 1,
                color: "rgba(240,242,255,0.95)",
              }}>
                {pct}
                <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(240,242,255,0.3)" }}>%</span>
              </div>
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 10,
                letterSpacing: "0.15em", color: "rgba(240,242,255,0.3)", textTransform: "uppercase",
              }}>
                Overall Trust
              </div>
            </div>
            <div style={{
              padding: "8px 20px", borderRadius: 100,
              background: `${vStyle.color}18`,
              border: `1px solid ${vStyle.color}55`,
              boxShadow: `0 0 20px ${vStyle.glow}`,
              fontFamily: "'Syne', sans-serif", fontWeight: 700,
              fontSize: 13, letterSpacing: "0.12em",
              color: vStyle.color,
            }}>
              {ts.verdict}
            </div>
          </div>
        )}

        {loading && !ts && (
          <div style={{
            padding: "8px 20px", borderRadius: 100,
            background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)",
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: "0.2em",
            color: "rgba(124,58,237,0.7)", textTransform: "uppercase",
          }}>
            Analyzing…
          </div>
        )}
      </div>

      {/* Pillar grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
      }}>
        {result
          ? Object.entries(result.pillars).map(([key, val]) => (
              <PillarCard key={key} pillar={key} result={val} />
            ))
          : !loading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                height: 120, borderRadius: 16,
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.05)",
              }} />
            ))
        }
      </div>

      {/* Critical flags summary */}
      {ts && ts.critical_flags.length > 0 && (
        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: 12,
          background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)",
        }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 10,
            letterSpacing: "0.15em", color: "#f43f5e", textTransform: "uppercase",
          }}>
            ⚠ Critical — {ts.critical_flags.join(" · ")}
          </span>
        </div>
      )}

      {/* Latency footer */}
      {result && (
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 10,
            color: "rgba(240,242,255,0.2)", letterSpacing: "0.05em",
          }}>
            Analysis completed in {result.total_latency_ms}ms · SDK {result.sdk_version}
          </span>
        </div>
      )}
    </div>
  );
}
