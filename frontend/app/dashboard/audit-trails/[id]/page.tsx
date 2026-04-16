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

<<<<<<< Updated upstream
  const ssePillarScores = (m.pillar_scores as Record<string, number>) || null;
  const dbPillarResults = (result.pillar_results as Record<string, Record<string, unknown>>) || null;
  let pillarScores: Record<string, number> | null = ssePillarScores;
  if (!pillarScores && dbPillarResults) {
    pillarScores = {};
    for (const [key, val] of Object.entries(dbPillarResults)) {
      const s = (val.score as Record<string, unknown>);
      if (s?.value != null) pillarScores[key] = (s.value as number) / 100;
    }
=======
const PRIORITY_COLORS: Record<string, string> = {
  IMMEDIATE: "#F43F5E",
  SHORT_TERM: "#f59e0b",
  MONITORING: "#06B6D4",
};

const PILLAR_ICONS: Record<string, string> = {
  safety: "🛡",
  hallucination: "🔍",
  bias: "⚖",
  prompt_security: "🔒",
  compliance: "📋",
};

const PILLAR_LABELS: Record<string, string> = {
  safety: "Safety & Toxicity",
  hallucination: "Hallucination",
  bias: "Bias & Fairness",
  prompt_security: "Prompt Security",
  compliance: "PII / Compliance",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: "rgba(124,58,237,0.08)",
        animation: "pulse 1.8s ease-in-out infinite",
      }}
    />
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
        borderRadius: 6,
        padding: "3px 8px",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

function Card({
  children,
  highlight,
  style: extraStyle,
}: {
  children: React.ReactNode;
  highlight?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "visible",
        ...extraStyle,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: highlight
            ? `linear-gradient(90deg, transparent, ${highlight}80, transparent)`
            : "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.5), transparent)",
        }}
      />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 500,
        fontSize: 10,
        letterSpacing: "3px",
        textTransform: "uppercase",
        color: "rgba(240,242,255,0.35)",
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function PillarScoreCard({
  name,
  score,
}: {
  name: string;
  score: number | undefined;
}) {
  const label = PILLAR_LABELS[name] || name;
  const icon = PILLAR_ICONS[name] || "●";
  // score from API is 0-1 trust (higher = safer). Risk = 1 - score.
  const risk = score != null ? 1 - score : null;
  const display = risk != null ? risk : null;
  const sev = display != null ? getSeverity(display) : { label: "N/A", color: "rgba(240,242,255,0.3)" };
  const barPct = display != null ? Math.round(display * 100) : 0;

  return (
    <div
      style={{
        padding: "14px 18px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(240,242,255,0.7)", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 15 }}>{icon}</span> {label}
        </span>
        <Badge label={sev.label} color={sev.color} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div
            style={{
              width: `${barPct}%`,
              height: "100%",
              borderRadius: 3,
              background: sev.color,
              transition: "width 0.6s ease",
            }}
          />
        </div>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: sev.color, minWidth: 36, textAlign: "right" }}>
          {display != null ? display.toFixed(2) : "—"}
        </span>
      </div>
    </div>
  );
}

function EnforcementTimeline({ verdict, latency }: { verdict: string | null; latency: number | null }) {
  const blocked = verdict === "BLOCK";
  const warned = verdict === "WARN";
  const passColor = "#10B981";
  const blockColor = "#F43F5E";
  const warnColor = "#f59e0b";

  const actionColor = blocked ? blockColor : warned ? warnColor : passColor;
  const actionLabel = verdict ? `Enforcement: ${verdict}` : "Enforcement Applied";

  const steps = [
    { label: "Request Received", color: passColor },
    { label: "Trust Evaluation Started", color: passColor, sub: "~10ms" },
    { label: actionLabel, color: actionColor, sub: latency ? `${latency}ms total` : undefined },
    { label: blocked ? "Blocked — Response withheld" : "Response Returned", color: actionColor },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: step.color, border: `2px solid ${step.color}40`, flexShrink: 0, marginTop: 3 }} />
            {i < steps.length - 1 && (
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
            )}
          </div>
          <div style={{ paddingBottom: i < steps.length - 1 ? 16 : 0 }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: step.color, fontWeight: 500 }}>{step.label}</div>
            {step.sub && (
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(240,242,255,0.3)", marginTop: 2 }}>{step.sub}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState("");

  const [intel, setIntel] = useState<IntelligenceResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState("");

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Fetch logged-in user so we can display their email in the forensic header
  // for historical records that stored a raw UUID as actor.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u?.email) setCurrentUserEmail(u.email); })
      .catch(() => {});
  }, []);

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
        {/* Pillar scores */}
        {m.pillarScores && Object.keys(m.pillarScores).length > 0 && (
          <div className="section-reveal" style={{ animationDelay: "0.15s", background: "#0d0f1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "28px", marginBottom: "20px" }}>
            <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "24px" }}>Pillar Scores</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {Object.entries(m.pillarScores).map(([pillar, score]) => {
                const pct = score * 100;
                const color = pct >= 85 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#f43f5e";
=======
        {detailError && (
          <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 12, color: "#f43f5e", fontFamily: "DM Sans, sans-serif", fontSize: 13, marginBottom: 24 }}>
            {detailError}
          </div>
        )}

        {/* ── Forensic Header ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <SectionLabel>Forensic Header</SectionLabel>
          {detailLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton h={24} w="60%" />
              <Skeleton h={14} w="40%" />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.5px", color: "#f0f2ff", marginBottom: 12 }}>
                  {detail?.request_id
                    ? `REQ-${detail.request_id.slice(0, 12).toUpperCase()}`
                    : "Request Detail"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(240,242,255,0.45)" }}>
                  <span>🕐 {fmtTs(detail?.created_at || null)}</span>
                  {detail?.total_latency_ms != null && <span>⚡ {detail.total_latency_ms}ms</span>}
                  {detail?.actor && <span>👤 {resolveActor(detail.actor, currentUserEmail)}</span>}
                  {detail?.ip_address && <span>📍 {detail.ip_address}</span>}
                </div>
              </div>
              {verdict && (
                <div
                  style={{
                    padding: "14px 24px",
                    background: `${verdictColor}12`,
                    border: `1px solid ${verdictColor}40`,
                    borderRadius: 14,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", color: "rgba(240,242,255,0.35)", marginBottom: 4, textTransform: "uppercase" }}>Enforcement</div>
                  <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: verdictColor }}>{verdict}</div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Radar + Pillar Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Radar chart */}
          <Card style={{ padding: 28 }}>
            <SectionLabel>Trust Pillar Radar</SectionLabel>
            {detailLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
                <Skeleton w="200px" h={200} />
              </div>
            ) : (
              <RadarChart pillarScores={pillarScores} />
            )}
          </Card>

          {/* Pillar score cards */}
          <Card style={{ padding: 28 }}>
            <SectionLabel>Pillar Score Breakdown</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["safety", "hallucination", "bias", "prompt_security", "compliance"].map((key) => (
                detailLoading ? (
                  <Skeleton key={key} h={58} />
                ) : (
                  <PillarScoreCard
                    key={key}
                    name={key}
                    score={pillarScores[key as keyof PillarScores]}
                  />
                )
              ))}
            </div>
          </Card>
        </div>

        {/* ── Evidence Panel ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <SectionLabel>Evidence Panel</SectionLabel>
          {detailLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><Skeleton h={80} /><Skeleton h={80} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <EvidenceBlock
                label="Prompt Excerpt"
                text={(detail?.metadata as Record<string, unknown>)?.prompt_preview as string | undefined}
              />
              <EvidenceBlock
                label="Response Excerpt"
                text={(detail?.metadata as Record<string, unknown>)?.response_preview as string | undefined}
              />
            </div>
          )}
          {!detailLoading && detail?.critical_flags && detail.critical_flags.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: 8 }}>Flags Triggered</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detail.critical_flags.map((flag, i) => (
                  <span key={i} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#F43F5E", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 6, padding: "3px 8px" }}>
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ── Enforcement Timeline ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <SectionLabel>Enforcement Timeline</SectionLabel>
          {detailLoading ? <Skeleton h={120} /> : (
            <EnforcementTimeline verdict={verdict} latency={detail?.total_latency_ms ?? null} />
          )}
        </Card>

        {/* ── AI Risk Thesis ── */}
        <Card style={{ marginBottom: 20, padding: 28 }} highlight="#7C3AED">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <SectionLabel>AI Risk Thesis</SectionLabel>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(124,58,237,0.7)", letterSpacing: "1px" }}>
                {intel?.cached ? "CACHED" : "GROQ-POWERED"}
              </span>
              <button
                onClick={() => loadIntelligence(true)}
                disabled={intelLoading}
                style={{
                  padding: "6px 12px",
                  background: "rgba(124,58,237,0.08)",
                  border: "1px solid rgba(124,58,237,0.25)",
                  borderRadius: 8,
                  color: "rgba(124,58,237,0.8)",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  cursor: intelLoading ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                ↻ Regenerate
              </button>
            </div>
          </div>

          {intelLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(124,58,237,0.6)", display: "flex", alignItems: "center", gap: 8, animation: "pulse 1.8s ease-in-out infinite" }}>
                <span>⬡</span> Generating forensic intelligence via Groq…
              </div>
              <Skeleton h={18} w="70%" />
              <Skeleton h={14} w="40%" />
              <Skeleton h={80} />
              <Skeleton h={80} />
            </div>
          )}

          {!intelLoading && intelError && (
            <div style={{ color: "#F43F5E", fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>{intelError}</div>
          )}

          {!intelLoading && intel?.error && (
            <div style={{ color: "rgba(240,242,255,0.4)", fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
              {intel.message || "Intelligence generation unavailable. Raw analysis data shown above."}
            </div>
          )}

          {!intelLoading && intel?.risk_thesis && (
            <div>
              {/* Headline */}
              <div
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  marginBottom: 16,
                  lineHeight: 1.3,
                }}
              >
                {intel.risk_thesis.headline}
              </div>

              {/* Severity + Pattern badges */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                <Badge
                  label={`Severity: ${intel.risk_thesis.severity_level}`}
                  color={SEVERITY_COLORS[intel.risk_thesis.severity_level] || "#06B6D4"}
                />
                <span
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4",
                    background: `${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4"}1a`,
                    border: `1px solid ${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4"}40`,
                    borderRadius: 6,
                    padding: "3px 8px",
                    display: "inline-block",
                    animation: systemPattern === "SYSTEMIC" ? "systemic-pulse 2s ease-in-out infinite" : "none",
                  }}
                >
                  Pattern: {intel.risk_thesis.risk_pattern}
                </span>
                {intel.risk_thesis.primary_pillar_at_risk && (
                  <Badge label={`Primary risk: ${intel.risk_thesis.primary_pillar_at_risk}`} color="#f59e0b" />
                )}
              </div>

              {/* Narrative */}
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 300,
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: "rgba(240,242,255,0.72)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {intel.risk_thesis.narrative}
              </div>

              {/* Confidence */}
              {intel.confidence_assessment && (
                <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(240,242,255,0.35)" }}>
                    Confidence: <span style={{ color: "rgba(240,242,255,0.6)" }}>{intel.confidence_assessment.evaluation_confidence}</span>
                    {intel.confidence_assessment.notes && ` — ${intel.confidence_assessment.notes}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Recommendations ── */}
        {!intelLoading && sortedRecs.length > 0 && (
          <Card style={{ marginBottom: 20, padding: 28 }}>
            <SectionLabel>Recommendations</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedRecs.map((rec, i) => {
                const pColor = PRIORITY_COLORS[rec.priority] || "#06B6D4";
                const pLabel = rec.priority === "SHORT_TERM" ? "SHORT TERM" : rec.priority;
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
        {/* ── Request Metadata ── */}
        <Card style={{ marginBottom: 24, padding: 28 }}>
          <SectionLabel>Request Metadata</SectionLabel>
          {detailLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><Skeleton h={14} /><Skeleton h={14} w="60%" /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              <MetaField label="Request ID" value={detail?.request_id || "—"} mono />
              <MetaField label="Log Type" value={detail?.log_type || "EVALUATION"} />
              <MetaField label="Entity Type" value={detail?.entity_type || "—"} />
              <MetaField label="Actor" value={detail?.actor || "—"} />
              <MetaField label="IP Address" value={detail?.ip_address || "—"} mono />
              <MetaField label="Timestamp" value={fmtTs(detail?.created_at || null)} mono />
              {detail?.total_latency_ms != null && <MetaField label="Latency" value={`${detail.total_latency_ms}ms`} mono />}
              {(detail?.metadata as Record<string, unknown>)?.sdk_version ? (
                <MetaField label="SDK Version" value={String((detail?.metadata as Record<string, unknown>)?.sdk_version)} mono />
              ) : null}
            </div>
          )}
        </Card>

        {/* ── Danger Zone ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: "10px 18px",
              background: "rgba(244,63,94,0.06)",
              border: "1px solid rgba(244,63,94,0.2)",
              borderRadius: 12,
              color: "#F43F5E",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Delete Report
          </button>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,8,16,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d0f1a",
              border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: 20,
              padding: 32,
              maxWidth: 440,
              width: "90%",
            }}
          >
            <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 20, color: "#f0f2ff", marginBottom: 12 }}>Delete Report?</h3>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 14, color: "rgba(240,242,255,0.5)", lineHeight: 1.6, marginBottom: 24 }}>
              This action cannot be undone. The generated PDF report for request{" "}
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f0f2ff" }}>
                {detail?.request_id?.slice(0, 12) || "—"}
              </span>{" "}
              will be permanently deleted. The audit log entry itself is immutable and will be preserved.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: "10px 18px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "rgba(240,242,255,0.6)", fontFamily: "DM Sans, sans-serif", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteReport}
                disabled={deleting}
                style={{ padding: "10px 18px", background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 10, color: "#F43F5E", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======

// ── Helper sub-components ─────────────────────────────────────────────────────

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono ? "JetBrains Mono, monospace" : "DM Sans, sans-serif", fontSize: 13, color: "rgba(240,242,255,0.75)", wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

function EvidenceBlock({ label, text }: { label: string; text?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const display = text || "[not available]";
  const truncated = display;

  return (
    <div>
      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: 8 }}>{label}</div>
      <div
        style={{
          background: "rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          padding: "12px 14px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          color: text ? "rgba(240,242,255,0.65)" : "rgba(240,242,255,0.2)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: "600px",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {truncated}
      </div>
    </div>
  );
}
>>>>>>> Stashed changes
