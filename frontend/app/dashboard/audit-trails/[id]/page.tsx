"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  LOW:      "#10B981",
  MEDIUM:   "#f59e0b",
  HIGH:     "#F43F5E",
  CRITICAL: "#F43F5E",
};

const PATTERN_COLORS: Record<string, string> = {
  ISOLATED:     "#06B6D4",
  RECURRING:    "#f59e0b",
  DRIFT_SIGNAL: "#F43F5E",
  SYSTEMIC:     "#F43F5E",
};

const PRIORITY_COLORS: Record<string, string> = {
  IMMEDIATE:  "#F43F5E",
  SHORT_TERM: "#f59e0b",
  MONITORING: "#06B6D4",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "rgba(124,58,237,0.06)",
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
          : "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.5), transparent)",
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
      color:         "rgba(240,242,255,0.35)",
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

function RiskThesisSection({ intel, loading, error, onRegenerate }: {
  intel:        IntelligenceResult | null;
  loading:      boolean;
  error:        string;
  onRegenerate: (force?: boolean) => void;
}) {
  const systemPattern = intel?.risk_thesis?.risk_pattern;
  return (
    <Card style={{ marginBottom: 20, padding: 28 }} highlight="#7C3AED">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <SectionLabel>AI Risk Thesis</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(124,58,237,0.6)", letterSpacing: "1px" }}>
            {intel?.cached ? "CACHED" : "GROQ-POWERED"}
          </span>
          <button
            onClick={() => onRegenerate(true)}
            disabled={loading}
            style={{
              padding:    "6px 12px",
              background: "rgba(124,58,237,0.08)",
              border:     "1px solid rgba(124,58,237,0.25)",
              borderRadius: 8,
              color:      "rgba(124,58,237,0.8)",
              fontFamily: "DM Sans, sans-serif",
              fontSize:   11,
              cursor:     loading ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            ↻ Regenerate
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "rgba(124,58,237,0.6)", animation: "pulse 1.8s ease-in-out infinite" }}>
            ⬡ Generating forensic intelligence via Groq…
          </div>
          <Skeleton h={18} w="70%" />
          <Skeleton h={80} />
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10, color: "#F43F5E", fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && intel?.error && (() => {
        const isCfg = intel.error_code === "GROQ_ERROR" && (intel.message ?? "").toLowerCase().includes("not configured");
        return (
          <div style={{
            padding: "14px 16px",
            background: isCfg ? "rgba(245,158,11,0.07)" : "rgba(244,63,94,0.07)",
            border: `1px solid ${isCfg ? "rgba(245,158,11,0.25)" : "rgba(244,63,94,0.2)"}`,
            borderRadius: 10,
          }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: isCfg ? "#f59e0b" : "#F43F5E" }}>
              {isCfg ? "AI Analysis Not Configured" : "AI Analysis Unavailable"}
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(240,242,255,0.5)", lineHeight: 1.6, marginTop: 4 }}>
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
            background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", marginBottom: 16, lineHeight: 1.3,
          }}>
            {intel.risk_thesis.headline}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <Badge
              label={`Severity: ${intel.risk_thesis.severity_level}`}
              color={SEVERITY_COLORS[intel.risk_thesis.severity_level] || "#06B6D4"}
            />
            <span style={{
              fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 10,
              letterSpacing: "1.5px", textTransform: "uppercase",
              color: PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4",
              background: `${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4"}1a`,
              border: `1px solid ${PATTERN_COLORS[intel.risk_thesis.risk_pattern] || "#06B6D4"}40`,
              borderRadius: 6, padding: "3px 8px", display: "inline-block",
              animation: systemPattern === "SYSTEMIC" ? "systemic-pulse 2s ease-in-out infinite" : "none",
            }}>
              Pattern: {intel.risk_thesis.risk_pattern}
            </span>
          </div>

          <div style={{
            fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 14,
            lineHeight: 1.8, color: "rgba(240,242,255,0.72)", whiteSpace: "pre-wrap",
          }}>
            {intel.risk_thesis.narrative}
          </div>

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
            background: "rgba(244,63,94,0.06)",
            border:     "1px solid rgba(244,63,94,0.2)",
            borderLeft: "3px solid #F43F5E",
            borderRadius: "0 10px 10px 0",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F43F5E" }} />
            <span style={{
              fontFamily: "JetBrains Mono, monospace", fontSize: 11,
              color: "#F43F5E",
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
          const pColor = PRIORITY_COLORS[rec.priority] || "#06B6D4";
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
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "rgba(240,242,255,0.35)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {rec.pillar}
                </span>
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: 14, color: "#f0f2ff", marginBottom: 4 }}>
                {rec.action}
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 13, color: "rgba(240,242,255,0.5)", lineHeight: 1.6 }}>
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
  const router    = useRouter();
  const requestId = params?.id as string;

  const [detail,       setDetail]       = useState<AuditDetail | null>(null);
  const [detailLoading,setDetailLoading]= useState(true);
  const [detailError,  setDetailError]  = useState("");

  const [intel,        setIntel]        = useState<IntelligenceResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError,   setIntelError]   = useState("");

  const [metrics,      setMetrics]      = useState<Record<string, PillarMetric>>({});
  const [correlations, setCorrelations] = useState<CorrelationData | null>(null);

  const [confirmDelete,setConfirmDelete]= useState(false);
  const [deleting,     setDeleting]     = useState(false);
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

  async function handleDelete() {
    if (!detail) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/audit-trails/${detail.id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); showToast(e.error || "Delete failed", "error"); return; }
      setConfirmDelete(false);
      router.push("/dashboard/audit-trails");
    } catch {
      showToast("Delete request failed", "error");
    } finally {
      setDeleting(false);
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
        @keyframes systemic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 6px rgba(244,63,94,0.25)} }
      `}</style>

      <div style={{ padding: "32px", flex: 1, overflowY: "auto" }}>

        {/* ── Nav bar ── */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link href="/dashboard/audit-trails" style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13,
            color: "rgba(240,242,255,0.4)", textDecoration: "none",
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
              background: "rgba(124,58,237,0.12)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 12, color: "#7C3AED",
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
          <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 12, color: "#f43f5e", fontFamily: "DM Sans, sans-serif", fontSize: 13, marginBottom: 24 }}>
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

        {/* ── Section 4: Latency Waterfall ── */}
        <Card style={{ marginBottom: 20, padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <SectionLabel>Latency Waterfall</SectionLabel>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(240,242,255,0.25)" }}>
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
          onRegenerate={loadIntelligence}
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

        {/* ── Danger zone ── */}
        {!detailLoading && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                padding:    "10px 18px",
                background: "rgba(244,63,94,0.06)",
                border:     "1px solid rgba(244,63,94,0.2)",
                borderRadius: 12, color: "#F43F5E",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                display:    "flex", alignItems: "center", gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Delete Record
            </button>
          </div>
        )}
      </div>

      {/* ── Delete modal ── */}
      {confirmDelete && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#0d0f1a", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 20, padding: 32, maxWidth: 440, width: "90%" }}
          >
            <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 20, color: "#f0f2ff", marginBottom: 12 }}>Delete Record?</h3>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: 14, color: "rgba(240,242,255,0.5)", lineHeight: 1.6, marginBottom: 24 }}>
              This action cannot be undone. The audit log entry will be permanently removed.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "10px 18px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "rgba(240,242,255,0.6)", fontFamily: "DM Sans, sans-serif", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: "10px 18px", background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 10, color: "#F43F5E", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 10, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding:    "12px 18px",
            background: t.type === "error" ? "rgba(244,63,94,0.12)" : "rgba(16,185,129,0.12)",
            border:     `1px solid ${t.type === "error" ? "rgba(244,63,94,0.3)" : "rgba(16,185,129,0.3)"}`,
            borderRadius: 12,
            color:      t.type === "error" ? "#F43F5E" : "#10B981",
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
