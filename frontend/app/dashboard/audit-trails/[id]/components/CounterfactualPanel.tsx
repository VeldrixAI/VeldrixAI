"use client";

import { useState, useRef } from "react";

const VERDICT_COLORS: Record<string, string> = {
  ALLOW:   "#10B981",
  WARN:    "#f59e0b",
  REVIEW:  "#06B6D4",
  BLOCK:   "#F43F5E",
};

interface EvalResult {
  verdict:      string;
  overallScore: number;
  pillarScores: Record<string, number>;
}

interface Props {
  originalPrompt:   string;
  originalResponse: string;
  originalVerdict:  string | null;
  originalScore:    number | null;
}

const MUTATIONS = [
  { label: "Remove PII",       transform: (t: string) => t.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED]").replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[NAME]") },
  { label: "Add disclaimer",   transform: (t: string) => t + "\n\nNote: This response is for informational purposes only." },
  { label: "Soften tone",      transform: (t: string) => t.replace(/\b(must|always|never|definitely)\b/gi, "may") },
];

function ScoreDelta({ delta }: { delta: number }) {
  const abs   = Math.abs(delta);
  const color = delta > 0 ? "#10B981" : delta < 0 ? "#F43F5E" : "#06B6D4";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700, color }}>
      {arrow} {abs.toFixed(2)}
    </span>
  );
}

export default function CounterfactualPanel({
  originalPrompt,
  originalResponse,
  originalVerdict,
  originalScore,
}: Props) {
  const [mutatedText, setMutatedText] = useState(originalResponse || originalPrompt || "");
  const [result,      setResult]      = useState<EvalResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [reEvalCount, setReEvalCount] = useState(0);
  const [quotaReset,  setQuotaReset]  = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const LIMIT = 5;
  const quotaOk = reEvalCount < LIMIT;

  async function handleEvaluate() {
    if (!quotaOk) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: originalPrompt, response: mutatedText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Evaluation failed");

      // Map response shape (trust_controller response)
      const d = data?.data ?? data;
      const score = d?.final_score?.value != null
        ? (d.final_score.value / 100)  // trust_controller returns 0-100
        : d?.trust_score?.overall ?? null;
      const v = d?.trust_score?.verdict ?? (score != null ? (score >= 0.85 ? "ALLOW" : score >= 0.6 ? "WARN" : "BLOCK") : "REVIEW");
      const ps: Record<string, number> = d?.trust_score?.pillar_scores ?? {};

      setResult({ verdict: v, overallScore: score ?? 0, pillarScores: ps });
      setReEvalCount(c => c + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  const scoreDelta = result && originalScore != null
    ? result.overallScore - originalScore
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Mutation buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {MUTATIONS.map(m => (
          <button
            key={m.label}
            onClick={() => setMutatedText(m.transform(mutatedText))}
            style={{
              padding:    "6px 12px",
              background: "rgba(124,58,237,0.08)",
              border:     "1px solid rgba(124,58,237,0.2)",
              borderRadius: 8,
              color:      "rgba(124,58,237,0.8)",
              fontFamily: "DM Sans, sans-serif",
              fontSize:   12,
              cursor:     "pointer",
              fontWeight: 500,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={mutatedText}
        onChange={e => setMutatedText(e.target.value)}
        rows={5}
        style={{
          width:        "100%",
          background:   "rgba(0,0,0,0.3)",
          border:       "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding:      "12px 14px",
          fontFamily:   "JetBrains Mono, monospace",
          fontSize:     12,
          color:        "rgba(240,242,255,0.7)",
          lineHeight:   1.6,
          resize:       "vertical",
          boxSizing:    "border-box",
        }}
      />

      {/* Re-evaluate button + quota */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleEvaluate}
          disabled={loading || !quotaOk}
          style={{
            padding:    "10px 20px",
            background: quotaOk ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
            border:     `1px solid ${quotaOk ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 10,
            color:      quotaOk ? "#7C3AED" : "rgba(240,242,255,0.2)",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize:   13,
            cursor:     quotaOk && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Evaluating…" : "Re-evaluate"}
        </button>
        <span style={{
          fontFamily: "JetBrains Mono, monospace", fontSize: 10,
          color:      quotaOk ? "rgba(240,242,255,0.25)" : "rgba(244,63,94,0.6)",
        }}>
          {quotaOk
            ? `${LIMIT - reEvalCount} re-evaluations remaining this hour`
            : "Counterfactual re-evaluation limit reached. Resets in 60 minutes."}
        </span>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px",
          background: "rgba(244,63,94,0.08)",
          border: "1px solid rgba(244,63,94,0.2)",
          borderRadius: 10,
          color: "#F43F5E",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Verdict diff */}
      {result && (
        <div
          style={{
            display:   "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap:       16,
            alignItems: "center",
            padding:   "18px 20px",
            background: "rgba(255,255,255,0.02)",
            border:    "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
          }}
        >
          {/* Original */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", color: "rgba(240,242,255,0.3)", marginBottom: 6 }}>
              ORIGINAL
            </div>
            <div style={{
              fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 20,
              color: VERDICT_COLORS[originalVerdict ?? ""] ?? "#06B6D4",
            }}>
              {originalVerdict ?? "—"}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(240,242,255,0.4)", marginTop: 4 }}>
              {originalScore != null ? originalScore.toFixed(3) : "—"}
            </div>
          </div>

          {/* Delta */}
          <div style={{ textAlign: "center" }}>
            {scoreDelta != null && <ScoreDelta delta={scoreDelta} />}
            <div style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              color: "rgba(240,242,255,0.2)", marginTop: 4,
            }}>
              TRUST DELTA
            </div>
          </div>

          {/* Counterfactual */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", color: "rgba(240,242,255,0.3)", marginBottom: 6 }}>
              COUNTERFACTUAL
            </div>
            <div style={{
              fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 20,
              color: VERDICT_COLORS[result.verdict] ?? "#06B6D4",
            }}>
              {result.verdict}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(240,242,255,0.4)", marginTop: 4 }}>
              {result.overallScore.toFixed(3)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
