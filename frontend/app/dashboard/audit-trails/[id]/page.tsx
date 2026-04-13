"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Recharts RadarChart — SSR-safe via dynamic import
const RadarChart = dynamic(() => import("./RadarChart"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type PillarScores = {
  safety?: number;
  hallucination?: number;
  bias?: number;
  prompt_security?: number;
  compliance?: number;
};

type AuditDetail = {
  id: string;
  request_id: string | null;
  log_type: string;
  action_type: string;
  verdict: string | null;
  overall_score: number | null;
  total_latency_ms: number | null;
  pillar_scores: PillarScores | null;
  critical_flags: string[];
  metadata: Record<string, unknown>;
  actor: string | null;
  ip_address: string | null;
  created_at: string | null;
  entity_type: string | null;
};

type RiskThesis = {
  headline: string;
  severity_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  narrative: string;
  primary_pillar_at_risk: string;
  risk_pattern: "ISOLATED" | "RECURRING" | "DRIFT_SIGNAL" | "SYSTEMIC";
};

type Recommendation = {
  priority: "IMMEDIATE" | "SHORT_TERM" | "MONITORING";
  pillar: string;
  action: string;
  rationale: string;
};

type IntelligenceResult = {
  risk_thesis?: RiskThesis | null;
  recommendations?: Recommendation[];
  confidence_assessment?: { evaluation_confidence: string; notes: string };
  cached?: boolean;
  error?: boolean;
  error_code?: string;
  message?: string;
  rate_limited?: boolean;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtTs(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// Returns a display-safe actor label.
// New records store the user's email; legacy records stored a raw UUID.
// If the stored actor looks like a UUID and we know the current user's email,
// we substitute it — since scoped DB queries already ensure this record
// belongs to the caller.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function resolveActor(actor: string | null, currentUserEmail: string | null): string | null {
  if (!actor) return null;
  if (UUID_RE.test(actor)) return currentUserEmail || actor.slice(0, 8) + "…";
  return actor;
}

function getSeverity(score: number): { label: string; color: string } {
  if (score < 0.2) return { label: "CLEAN", color: "#10B981" };
  if (score < 0.4) return { label: "LOW", color: "#10B981" };
  if (score < 0.6) return { label: "MEDIUM", color: "#f59e0b" };
  if (score < 0.8) return { label: "HIGH", color: "#F43F5E" };
  return { label: "CRITICAL", color: "#F43F5E" };
}

const VERDICT_COLORS: Record<string, string> = {
  ALLOW: "#10B981",
  WARN: "#f59e0b",
  REVIEW: "#06B6D4",
  BLOCK: "#F43F5E",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#10B981",
  MEDIUM: "#f59e0b",
  HIGH: "#F43F5E",
  CRITICAL: "#F43F5E",
};

const PATTERN_COLORS: Record<string, string> = {
  ISOLATED: "#06B6D4",
  RECURRING: "#f59e0b",
  DRIFT_SIGNAL: "#F43F5E",
  SYSTEMIC: "#F43F5E",
};

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
        overflow: "hidden",
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
  }

  // Load audit detail
  useEffect(() => {
    if (!requestId) return;
    setDetailLoading(true);
    fetch(`/api/audit-trails/${requestId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDetail(data);
      })
      .catch((e) => setDetailError(e.message || "Failed to load"))
      .finally(() => setDetailLoading(false));
  }, [requestId]);

  // Load intelligence after detail is available
  const loadIntelligence = useCallback(
    async (force = false) => {
      if (!requestId) return;
      setIntelLoading(true);
      setIntelError("");
      try {
        const qs = force ? "?force_refresh=true" : "";
        const res = await fetch(`/api/audit-trails/${requestId}/intelligence${qs}`, {
          method: "POST",
        });
        const data = await res.json();
        setIntel(data);
      } catch (e) {
        setIntelError(e instanceof Error ? e.message : "Intelligence load failed");
      } finally {
        setIntelLoading(false);
      }
    },
    [requestId]
  );

  useEffect(() => {
    if (detail?.request_id) loadIntelligence();
  }, [detail?.request_id, loadIntelligence]);

  // Create Report (PDF)
  async function handleCreateReport() {
    if (!detail) return;
    setGeneratingPdf(true);
    try {
      const meta = detail.metadata as Record<string, unknown>;
      const res = await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Evaluation — ${(detail.request_id || detail.id).slice(0, 8)} — ${new Date(detail.created_at || "").toISOString().slice(0, 10)}`,
          report_type: "trust_evaluation",
          input_payload: { ...meta, request_id: detail.request_id },
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
      a.download = `veldrix-trust-${(detail.request_id || detail.id).slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Report created and downloaded → check Reports page");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Report creation failed", "error");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Delete Report (placeholder — navigates to reports to delete there)
  async function handleDeleteReport() {
    setDeleting(true);
    try {
      showToast("Navigate to Reports page to delete generated reports");
      setConfirmDelete(false);
      router.push("/dashboard/reports");
    } finally {
      setDeleting(false);
    }
  }

  const pillarScores = detail?.pillar_scores || {};
  const verdict = detail?.verdict || null;
  const verdictColor = verdict ? VERDICT_COLORS[verdict] || "#06B6D4" : "#06B6D4";

  const sortedRecs = [...(intel?.recommendations || [])].sort((a, b) => {
    const order = { IMMEDIATE: 0, SHORT_TERM: 1, MONITORING: 2 };
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
  });

  const systemPattern = intel?.risk_thesis?.risk_pattern;

  return (
    <>
      {/* Pulse animation for SYSTEMIC pattern */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes systemic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 6px rgba(244,63,94,0.25)} }
      `}</style>

      <div style={{ padding: "32px", flex: 1, overflowY: "auto" }}>

        {/* ── Header bar ── */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link
            href="/dashboard/audit-trails"
            style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(240,242,255,0.4)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Audit Trail
          </Link>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleCreateReport}
              disabled={generatingPdf || detailLoading}
              style={{
                padding: "10px 18px",
                background: "rgba(124,58,237,0.12)",
                border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 12,
                color: "#7C3AED",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                cursor: generatingPdf ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: detailLoading ? 0.5 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {generatingPdf ? "Generating…" : "Create Report"}
            </button>
          </div>
        </div>

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                return (
                  <div
                    key={i}
                    style={{
                      padding: "16px 18px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderLeft: `3px solid ${pColor}`,
                      borderRadius: "0 12px 12px 0",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <Badge label={pLabel} color={pColor} />
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "rgba(240,242,255,0.35)", textTransform: "uppercase", letterSpacing: "1px" }}>{rec.pillar}</span>
                    </div>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: 14, color: "#f0f2ff", marginBottom: 4 }}>{rec.action}</div>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 13, color: "rgba(240,242,255,0.5)", lineHeight: 1.6 }}>{rec.rationale}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

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
              {(detail?.metadata as Record<string, unknown>)?.sdk_version && (
                <MetaField label="SDK Version" value={(detail?.metadata as Record<string, unknown>)?.sdk_version as string} mono />
              )}
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
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 10, zIndex: 9999 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "12px 18px",
              background: t.type === "error" ? "rgba(244,63,94,0.12)" : "rgba(16,185,129,0.12)",
              border: `1px solid ${t.type === "error" ? "rgba(244,63,94,0.3)" : "rgba(16,185,129,0.3)"}`,
              borderRadius: 12,
              color: t.type === "error" ? "#F43F5E" : "#10B981",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 360,
              backdropFilter: "blur(8px)",
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}

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
  const truncated = display.length > 400 && !expanded ? display.slice(0, 400) + "…" : display;

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
        }}
      >
        {truncated}
      </div>
      {text && text.length > 400 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ marginTop: 6, background: "none", border: "none", color: "rgba(124,58,237,0.7)", fontFamily: "DM Sans, sans-serif", fontSize: 12, cursor: "pointer", padding: 0 }}
        >
          {expanded ? "Show less" : "Show full"}
        </button>
      )}
    </div>
  );
}
