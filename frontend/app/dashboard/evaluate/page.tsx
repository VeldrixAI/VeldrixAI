"use client";

import { FormEvent, useState, useEffect } from "react";

/* ─── Provider/model catalog type (from /api/models) ─── */
type ProviderEntry = { provider: string; adapter: string; models: string[] };

/* ─── Derive a Record<provider, models[]> from the API response ─── */
function toProviderMap(catalog: ProviderEntry[]): Record<string, string[]> {
  return Object.fromEntries(catalog.map((e) => [e.provider, e.models]));
}

/* ─── Types ─── */
type TrustResponse = {
  data: {
    final_score: { value: number; confidence: number; risk_level?: string };
    pillar_results: Record<string, {
      metadata: { name: string; weight: number };
      score?: { value: number };
      flags: string[];
      status: string;
    }>;
    metadata?: { cache_hit?: boolean; request_id?: string };
  };
};

type PillarResult = {
  name: string;
  score: number;
  description: string;
  flags: string[];
  status: string;
};

type EvaluationResult = {
  aggregate_score: number;
  pillars: PillarResult[];
  summary: string;
  recommendation: string;
  audit_hash: string;
};

/* ─── Helper: map API response to display shape ─── */
function mapToResult(data: TrustResponse["data"]): EvaluationResult {
  const score = Math.round(data.final_score.value);
  const risk = data.final_score.risk_level ?? "unknown";
  const pillars: PillarResult[] = Object.entries(data.pillar_results).map(([, r]) => ({
    name: r.metadata?.name ?? "Unknown",
    score: Math.round((r.score?.value ?? 0)),
    description: r.flags.length > 0 ? r.flags.join(". ") : `Status: ${r.status}`,
    flags: r.flags,
    status: r.status,
  }));
  return {
    aggregate_score: score,
    pillars,
    summary: `This interaction was evaluated at ${score}/100 with ${risk} risk level.`,
    recommendation: risk === "low" || risk === "safe"
      ? "No action required. This interaction meets Sovereign Layer governance standards."
      : `Review flagged pillars. Risk level is ${risk} — consider adjusting prompting strategy.`,
    audit_hash: data.metadata?.request_id ?? "",
  };
}

/* ─── Helper: pillar score to color ─── */
function pillarColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

/* ─── Helper: pillar icon ─── */
function PillarIcon({ name }: { name: string }) {
  const colorMap: Record<string, string> = {
    Integrity: "#10b981",
    Truth: "#7c3aed",
    "Audit Trace": "#06b6d4",
    "Policy Engine": "#10b981",
    "Risk Scoring": "#f43f5e",
  };
  const color = colorMap[name] ?? "#7c3aed";
  const pathMap: Record<string, string> = {
    Integrity: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    Truth: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    "Audit Trace": "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
    "Policy Engine": "M3 6h18M3 12h18M3 18h18",
    "Risk Scoring": "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  };
  const d = pathMap[name] ?? pathMap["Integrity"];
  return (
    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={d}/>
      </svg>
    </div>
  );
}

/* ─── Page Component ─── */
export default function EvaluatePage() {
  const [providers, setProviders] = useState<Record<string, string[]>>({});
  const [providersLoading, setProvidersLoading] = useState(true);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [results, setResults] = useState<EvaluationResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");

  // Fetch provider/model catalog from backend on mount
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: ProviderEntry[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const map = toProviderMap(data);
          setProviders(map);
          const firstProvider = data[0].provider;
          setProvider(firstProvider);
          setModel(data[0].models[0] ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setProvidersLoading(false));
  }, []);

  /* ─── PDF generation ─── */
  async function generatePdfReport(result: EvaluationResult, auditHash: string): Promise<void> {
    try {
      const res = await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Evaluation — ${auditHash.slice(0, 8) || "manual"} — ${new Date().toISOString().slice(0, 10)}`,
          report_type: "trust_evaluation",
          input_payload: { aggregate_score: result.aggregate_score, pillars: result.pillars, recommendation: result.recommendation },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veldrix-trust-${auditHash.slice(0, 8) || "report"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF generation failed";
      setError(msg);
    }
  }

  // Live stat data
  const [safetyIndex, setSafetyIndex] = useState<number | null>(null);
  const [auditLatency, setAuditLatency] = useState<string | null>(null);

  // Fetch live stats on mount
  useEffect(() => {
    fetch("/api/sdk-stats?range=7d")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          if (data.avg_trust_score != null) setSafetyIndex(data.avg_trust_score * 100);
          if (data.avg_latency_ms != null) setAuditLatency(`${data.avg_latency_ms}ms`);
        }
      })
      .catch(() => {});
  }, []);

  function handleProviderChange(p: string) {
    setProvider(p);
    setModel(providers[p]?.[0] ?? "");
  }

  async function handleEvaluate(e: FormEvent) {
    e.preventDefault();
    if (!userPrompt.trim() || !aiResponse.trim()) return;

    setIsEvaluating(true);
    setShowResults(false);
    setResults(null);
    setError("");

    try {
      const t0 = performance.now();
      const res = await fetch("/api/trust/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, response: aiResponse, model, provider }),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || payload.detail || "Evaluation failed");

      const mapped = mapToResult(payload.data);
      setResults(mapped);

      // Update stat boxes with this evaluation's data
      setSafetyIndex(mapped.aggregate_score);
      setAuditLatency(`${latencyMs}ms`);

      await new Promise((resolve) => setTimeout(resolve, 300));
      setShowResults(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setIsEvaluating(false);
    }
  }

  const canSubmit = userPrompt.trim().length > 0 && aiResponse.trim().length > 0;

  return (
    <div style={{ padding: "32px", flex: 1, overflowY: "auto" }}>

      {/* ── Hero Section ── */}
      <section style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "48px", alignItems: "flex-end", marginBottom: "40px" }} className="section-reveal">
        <div>
          <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "4px", textTransform: "uppercase", color: "#10b981", display: "block", marginBottom: "16px" }}>
            Manual Trust Protocol
          </label>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "clamp(40px, 5vw, 60px)", letterSpacing: "-2.5px", color: "#f0f2ff", lineHeight: 0.95, marginBottom: "24px" }}>
            Trust Evaluation{" "}
            <span style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 50%, #4f46e5 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Workspace.</span>
          </h1>
          <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "17px", color: "rgba(240,242,255,0.5)", maxWidth: "520px", lineHeight: 1.7 }}>
            Verify model alignment through our sovereign auditing layer. Input raw signals to synthesize multi-pillar governance reports in real-time.
          </p>
        </div>

        {/* Live stat boxes */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "flex-end" }}>
          <div className="glass-panel stat-box-glow" style={{ padding: "20px 24px", borderRadius: "16px", minWidth: "130px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.06)", transition: "all 0.3s" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "28px", color: "#10b981", letterSpacing: "-1px", lineHeight: 1 }}>
              {safetyIndex !== null ? safetyIndex.toFixed(1) : "—"}
            </span>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 500, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginTop: "6px" }}>Safety Index</span>
          </div>
          <div className="glass-panel stat-box-glow" style={{ padding: "20px 24px", borderRadius: "16px", minWidth: "130px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.06)", transition: "all 0.3s" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "28px", color: "#7c3aed", letterSpacing: "-1px", lineHeight: 1 }}>
              {auditLatency !== null ? auditLatency : "—"}
            </span>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 500, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginTop: "6px" }}>Audit Latency</span>
          </div>
        </div>
      </section>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ marginBottom: "24px", padding: "14px 18px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "12px", color: "#f43f5e", fontFamily: "DM Sans, sans-serif", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* ── Configuration Bento ── */}
      <form onSubmit={handleEvaluate}>
        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", marginBottom: "40px" }} className="section-reveal">

          {/* Model Configuration */}
          <div className="glass-panel" style={{ padding: "32px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: "24px" }}>
              Model Configuration
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Provider */}
              <div>
                <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", display: "block", marginBottom: "8px" }}>AI Provider</label>
                <div style={{ position: "relative" }}>
                  {providersLoading ? (
                    <div style={{ width: "100%", background: "#161926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "12px 14px", color: "rgba(240,242,255,0.2)", fontFamily: "DM Sans, sans-serif", fontSize: "14px", animation: "pulse 1.5s ease-in-out infinite" }}>
                      Loading providers…
                    </div>
                  ) : (
                    <select
                      value={provider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      style={{ width: "100%", background: "#161926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "12px 40px 12px 14px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px", outline: "none", cursor: "pointer", appearance: "none", transition: "border-color 0.2s" }}
                      onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
                    >
                      {Object.keys(providers).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                  {!providersLoading && (
                    <svg style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(240,242,255,0.35)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  )}
                </div>
              </div>
              {/* Model */}
              <div>
                <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", display: "block", marginBottom: "8px" }}>Model Version</label>
                <div style={{ position: "relative" }}>
                  {providersLoading ? (
                    <div style={{ width: "100%", background: "#161926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "12px 14px", color: "rgba(240,242,255,0.2)", fontFamily: "DM Sans, sans-serif", fontSize: "14px", animation: "pulse 1.5s ease-in-out infinite" }}>
                      Loading models…
                    </div>
                  ) : (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      style={{ width: "100%", background: "#161926", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "12px 40px 12px 14px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px", outline: "none", cursor: "pointer", appearance: "none", transition: "border-color 0.2s" }}
                      onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
                    >
                      {(providers[provider] ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {!providersLoading && (
                    <svg style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(240,242,255,0.35)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Input Canvas */}
          <div className="glass-panel" style={{ padding: "32px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "20px" }}>
            <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)" }}>
              Evaluation Inputs
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {/* User Prompt */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)" }}>User Prompt</span>
                <textarea
                  className="prompt-textarea"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Enter the user prompt to evaluate..."
                  style={{ background: "#0a0c15", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "14px 16px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px", lineHeight: 1.7, resize: "vertical", outline: "none", minHeight: "160px", maxHeight: "320px", transition: "border-color 0.2s" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.45)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
                />
              </div>
              {/* AI Response */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)" }}>AI Response</span>
                <textarea
                  className="prompt-textarea"
                  value={aiResponse}
                  onChange={(e) => setAiResponse(e.target.value)}
                  placeholder="Enter the AI response to evaluate..."
                  style={{ background: "#0a0c15", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "14px 16px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px", lineHeight: 1.7, resize: "vertical", outline: "none", minHeight: "160px", maxHeight: "320px", transition: "border-color 0.2s" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.45)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
                />
              </div>
            </div>

            {/* Evaluate CTA */}
            <button
              type="submit"
              disabled={isEvaluating || !canSubmit}
              style={{
                width: "100%", padding: "16px", borderRadius: "14px", border: "none", cursor: canSubmit && !isEvaluating ? "pointer" : "default",
                fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "14px", letterSpacing: "3px",
                textTransform: "uppercase", transition: "all 0.3s",
                background: isEvaluating ? "rgba(124,58,237,0.3)" : "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)",
                color: isEvaluating ? "rgba(240,242,255,0.6)" : "white",
                opacity: !canSubmit ? 0.5 : 1,
                boxShadow: (canSubmit && !isEvaluating) ? "0 4px 24px rgba(124,58,237,0.35)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
              }}
            >
              {isEvaluating ? (
                <>
                  <svg className="eval-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Evaluating Trust Matrix…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  Evaluate Trust Matrix
                </>
              )}
            </button>
          </div>
        </section>
      </form>

      {/* ── Results Section (animates in after evaluation) ── */}
      {showResults && results && (
        <section className="results-panel" style={{ display: "grid", gridTemplateColumns: "4fr 8fr", gap: "24px", marginBottom: "40px" }}>

          {/* Aggregate Score Ring */}
          <div className="glass-panel" style={{ padding: "40px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 40%, rgba(124,58,237,0.08), transparent 70%)", pointerEvents: "none" }}/>
            <div style={{ position: "relative", width: "192px", height: "192px", marginBottom: "24px" }}>
              <svg width="192" height="192" viewBox="0 0 192 192" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="96" cy="96" r="80" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="12"/>
                <circle
                  className="score-ring-fill"
                  cx="96" cy="96" r="80" fill="transparent"
                  stroke={results.aggregate_score >= 80 ? "#10b981" : results.aggregate_score >= 60 ? "#f59e0b" : "#f43f5e"}
                  strokeWidth="12" strokeLinecap="round"
                  strokeDasharray="502.65"
                  style={{ "--ring-target": `${502.65 * (1 - results.aggregate_score / 100)}` } as React.CSSProperties}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span className="score-number" style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "52px", color: "#f0f2ff", letterSpacing: "-2px", lineHeight: 1 }}>
                  {results.aggregate_score}
                </span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 500, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginTop: "4px" }}>Aggregate Score</span>
              </div>
            </div>

            <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "18px", color: "#f0f2ff", marginBottom: "8px", textAlign: "center" }}>
              {results.aggregate_score >= 80 ? "Trust Integrity High" : results.aggregate_score >= 60 ? "Moderate Risk Detected" : "Trust Integrity Low"}
            </h3>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "12px", color: "rgba(240,242,255,0.4)", maxWidth: "200px", textAlign: "center", lineHeight: 1.6 }}>
              {results.summary}
            </p>

            <div style={{ marginTop: "24px", display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ padding: "5px 12px", background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "100px", fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>Verified</span>
              <span style={{ padding: "5px 12px", background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.2)", borderRadius: "100px", fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>Encrypted</span>
            </div>

            <button
              onClick={() => generatePdfReport(results, results.audit_hash)}
              style={{ marginTop: "20px", padding: "10px 20px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "10px", color: "#7c3aed", fontFamily: "DM Sans, sans-serif", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,58,237,0.25)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(124,58,237,0.15)")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PDF Report
            </button>
          </div>

          {/* Pillar Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {results.pillars.map((pillar, i) => (
              <div
                key={pillar.name}
                className={`pillar-card-reveal pc-${i + 1} glass-panel`}
                style={{ padding: "24px", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.06)", cursor: "default", transition: "all 0.25s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.25)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <PillarIcon name={pillar.name} />
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "13px", color: pillarColor(pillar.score), letterSpacing: "-0.5px" }}>
                    {pillar.score}%
                  </span>
                </div>
                <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "14px", color: "#f0f2ff", marginBottom: "8px" }}>{pillar.name}</h4>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "11px", color: "rgba(240,242,255,0.4)", lineHeight: 1.6 }}>{pillar.description}</p>
                <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden", marginTop: "16px" }}>
                  <div className={`pillar-bar-fill pb-${i + 1}`} style={{ height: "100%", width: `${pillar.score}%`, background: pillarColor(pillar.score), borderRadius: "2px" }}/>
                </div>
              </div>
            ))}

            {/* Sovereign Recommendation — spans remaining space */}
            {results.recommendation && (
              <div
                className="pillar-card-reveal pc-6"
                style={{ gridColumn: results.pillars.length < 3 ? "1 / span 3" : results.pillars.length % 3 === 0 ? "1 / span 3" : "1 / span 2", padding: "24px", borderRadius: "18px", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", gap: "20px", transition: "border-color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.2)")}
              >
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "14px", color: "#a78bfa", marginBottom: "6px" }}>Sovereign Recommendation</h4>
                  <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "12px", color: "rgba(167,139,250,0.7)", lineHeight: 1.6 }}>
                    {results.recommendation}{" "}
                    {results.audit_hash && (
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(167,139,250,0.5)" }}>
                        Audit ID: {results.audit_hash.slice(0, 8)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => generatePdfReport(results, results.audit_hash)}
                  style={{ padding: "10px", background: "#7c3aed", border: "none", borderRadius: "10px", cursor: "pointer", color: "white", transition: "background 0.2s", flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#6d28d9")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#7c3aed")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
