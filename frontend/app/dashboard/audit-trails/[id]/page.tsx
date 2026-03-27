"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

type AuditRecord = {
  id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  request_id?: string | null;
};

const VERDICT_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  ALLOW:  { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  color: "#10b981" },
  WARN:   { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  color: "#f59e0b" },
  REVIEW: { bg: "rgba(6,182,212,0.12)",   border: "rgba(6,182,212,0.3)",   color: "#06b6d4" },
  BLOCK:  { bg: "rgba(244,63,94,0.12)",   border: "rgba(244,63,94,0.3)",   color: "#f43f5e" },
};

function fmtTs(ts: string) {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function riskToVerdict(risk: string): string {
  const r = risk.toLowerCase();
  if (r === "safe" || r === "low") return "ALLOW";
  if (r === "review_required" || r === "medium") return "REVIEW";
  if (r === "high_risk" || r === "high") return "WARN";
  if (r === "critical") return "BLOCK";
  return "REVIEW";
}

function getMeta(r: AuditRecord) {
  const m = (r.metadata || {}) as Record<string, unknown>;
  const result = (m.result as Record<string, unknown>) || {};
  const finalScore = (result.final_score as Record<string, unknown>) || {};

  const requestId = (m.request_id as string) || (result.request_id as string) || null;
  const rawVerdict = (m.verdict as string) || null;
  const riskLevel = (finalScore.risk_level as string) || null;
  const verdict = rawVerdict || (riskLevel ? riskToVerdict(riskLevel) : null);

  const sseScore = m.overall_score as number | null ?? null;
  const dbScore = finalScore.value as number | null ?? null;
  const overallScore = sseScore ?? (dbScore != null ? dbScore / 100 : null);

  const totalLatencyMs = (m.total_latency_ms as number) || (result.execution_time_ms as number) || null;

  const ssePillarScores = (m.pillar_scores as Record<string, number>) || null;
  const dbPillarResults = (result.pillar_results as Record<string, Record<string, unknown>>) || null;
  let pillarScores: Record<string, number> | null = ssePillarScores;
  if (!pillarScores && dbPillarResults) {
    pillarScores = {};
    for (const [key, val] of Object.entries(dbPillarResults)) {
      const s = (val.score as Record<string, unknown>);
      if (s?.value != null) pillarScores[key] = (s.value as number) / 100;
    }
  }

  return {
    requestId,
    verdict,
    overallScore,
    pillarScores,
    totalLatencyMs,
    sdkVersion: (m.sdk_version as string) || null,
    criticalFlags: (m.critical_flags as string[]) || [],
    model: (m.model as string) || null,
    provider: (m.provider as string) || null,
  };
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [record, setRecord] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  function showToast(message: string, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/audit-trails?id=${id}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load record");
        setRecord(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load record");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function generatePdf(e: React.MouseEvent) {
    e.preventDefault();
    if (!record || pdfDone) return;
    setGeneratingPdf(true);
    try {
      const m = record.metadata as Record<string, unknown> | null;
      const reqId = (m?.request_id as string) || record.id;
      const res = await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Evaluation — ${reqId.slice(0, 8)} — ${new Date(record.created_at).toISOString().slice(0, 10)}`,
          report_type: "trust_evaluation",
          input_payload: m ?? {},
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veldrix-trust-${reqId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfDone(true);
      showToast("PDF downloaded — report saved to Reports");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "PDF generation failed", "error");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: "32px", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg style={{ animation: "evalSpin 0.8s linear infinite" }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ padding: "32px", flex: 1 }}>
        <button
          onClick={() => router.push("/dashboard/audit-trails")}
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", color: "rgba(240,242,255,0.45)", fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 600, marginBottom: "24px", padding: 0 }}
        >
          ← Back to Audit Logs
        </button>
        <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "12px", color: "#f43f5e", fontFamily: "DM Sans, sans-serif", fontSize: "13px" }}>
          {error || "Record not found"}
        </div>
      </div>
    );
  }

  const m = getMeta(record);
  const vs = m.verdict ? VERDICT_STYLE[m.verdict] : null;
  const isTrust = record.action_type === "trust_evaluation";

  const detailRows = [
    { key: "Action", value: <span style={{ padding: "4px 12px", borderRadius: "6px", fontSize: "10px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, background: "rgba(124,58,237,0.12)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}>{record.action_type.replace(/_/g, " ")}</span> },
    m.requestId ? { key: "Request ID", value: <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "#7c3aed", wordBreak: "break-all" as const }}>{m.requestId}</code> } : null,
    (vs && m.verdict) ? { key: "Verdict", value: <span style={{ padding: "4px 12px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color }}>{m.verdict}</span> } : null,
    m.overallScore != null ? { key: "Trust Score", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "18px", color: m.overallScore >= 0.85 ? "#10b981" : m.overallScore >= 0.6 ? "#f59e0b" : "#f43f5e" }}>{(m.overallScore * 100).toFixed(1)}%</span> } : null,
    m.totalLatencyMs != null ? { key: "Latency", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "14px", color: "rgba(240,242,255,0.7)" }}>{m.totalLatencyMs}ms</span> } : null,
    m.sdkVersion ? { key: "SDK Version", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{m.sdkVersion}</span> } : null,
    m.model ? { key: "Model", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{m.model}</span> } : null,
    m.provider ? { key: "Provider", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{m.provider}</span> } : null,
    { key: "Timestamp", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{fmtTs(record.created_at)}</span> },
    { key: "IP Address", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{record.ip_address || "—"}</span> },
    record.entity_type ? { key: "Entity Type", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>{record.entity_type}</span> } : null,
  ].filter(Boolean) as { key: string; value: React.ReactNode }[];

  return (
    <>
      <div style={{ padding: "32px", flex: 1, overflowY: "auto", maxWidth: "860px", margin: "0 auto", width: "100%" }}>

        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard/audit-trails")}
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", color: "rgba(240,242,255,0.45)", fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 600, marginBottom: "28px", padding: 0, transition: "color 0.2s" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a78bfa")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(240,242,255,0.45)")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Audit Logs
        </button>

        {/* Page heading */}
        <div className="section-reveal" style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "28px", letterSpacing: "-0.5px", color: "#f0f2ff", marginBottom: "6px" }}>
              Audit Detail
            </h2>
            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.3)", letterSpacing: "0.5px" }}>
              {record.id}
            </p>
          </div>
          {isTrust && (
            <button
              disabled={generatingPdf || pdfDone}
              onClick={generatePdf}
              style={{ padding: "12px 24px", borderRadius: "12px", border: "none", cursor: generatingPdf || pdfDone ? "default" : "pointer", fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: pdfDone ? "rgba(16,185,129,0.15)" : "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)", color: pdfDone ? "#10b981" : "white", border: pdfDone ? "1px solid rgba(16,185,129,0.3)" : "none", display: "flex", alignItems: "center", gap: "8px", transition: "opacity 0.2s", opacity: generatingPdf ? 0.6 : 1, flexShrink: 0 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {generatingPdf ? "Generating…" : pdfDone ? "✓ Report Ready" : "Generate PDF Report"}
            </button>
          )}
        </div>

        {/* Core details card */}
        <div className="section-reveal" style={{ animationDelay: "0.1s", background: "#0d0f1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "28px", marginBottom: "20px" }}>
          <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "24px" }}>Record Details</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 32px" }}>
            {detailRows.map((row) => (
              <div key={row.key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)" }}>{row.key}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pillar scores */}
        {m.pillarScores && Object.keys(m.pillarScores).length > 0 && (
          <div className="section-reveal" style={{ animationDelay: "0.15s", background: "#0d0f1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "28px", marginBottom: "20px" }}>
            <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "24px" }}>Pillar Scores</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {Object.entries(m.pillarScores).map(([pillar, score]) => {
                const pct = score * 100;
                const color = pct >= 85 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#f43f5e";
                return (
                  <div key={pillar} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px", textTransform: "capitalize", color: "rgba(240,242,255,0.5)", minWidth: "140px" }}>
                      {pillar.replace(/_/g, " ")}
                    </span>
                    <div style={{ flex: 1, height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px", transition: "width 0.6s ease" }} />
                    </div>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", fontWeight: 700, color, minWidth: "48px", textAlign: "right" }}>{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Critical flags */}
        {m.criticalFlags.length > 0 && (
          <div className="section-reveal" style={{ animationDelay: "0.2s", padding: "20px 24px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "16px", marginBottom: "20px" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "#f43f5e", marginBottom: "10px" }}>Critical Flags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {m.criticalFlags.map((flag, i) => (
                <span key={i} style={{ padding: "4px 12px", borderRadius: "6px", fontFamily: "DM Sans, sans-serif", fontSize: "12px", fontWeight: 500, background: "rgba(244,63,94,0.1)", color: "rgba(244,63,94,0.85)", border: "1px solid rgba(244,63,94,0.2)" }}>
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Raw metadata */}
        {record.metadata && Object.keys(record.metadata).length > 0 && (
          <div className="section-reveal" style={{ animationDelay: "0.25s", background: "#0d0f1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "28px" }}>
            <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "16px" }}>Raw Metadata</h4>
            <pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "rgba(240,242,255,0.45)", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.8, margin: 0 }}>
              {JSON.stringify(record.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", padding: "12px 16px", borderRadius: "12px", fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 500, color: "#f0f2ff", background: toast.type === "error" ? "rgba(244,63,94,0.9)" : "rgba(16,185,129,0.9)", backdropFilter: "blur(12px)", border: `1px solid ${toast.type === "error" ? "rgba(244,63,94,0.5)" : "rgba(16,185,129,0.5)"}`, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 300, animation: "telRowIn 0.3s ease both" }}>
          {toast.message}
        </div>
      )}
    </>
  );
}
