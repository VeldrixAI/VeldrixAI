"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/* ─── Types (kept from original) ─── */
type TimeRange = "7d" | "14d" | "30d";
type Summary = {
  total_evaluations: number;
  completed: number;
  failed: number;
  in_progress: number;
  total_audit_events: number;
  approval_rate: number;
  avg_latency_ms: number | null;
};
type SdkStats = {
  total_requests: number;
  avg_trust_score: number;
  avg_latency_ms: number;
  verdict_breakdown: Record<string, number>;
  pillar_averages: Record<string, number | null>;
  daily_volume: { date: string; count: number }[];
  period_days: number;
};
type TimePoint = { date: string; requests: number; approved: number; blocked: number };
type OutcomeRow = { type: string; completed: number; failed: number; generating: number };
type AuditRecord = {
  id: string;
  action_type: string;
  entity_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

function mapAuditRow(r: AuditRecord) {
  const meta = r.metadata || {};
  const verdict = (meta.verdict as string) || "";
  const rawScore = typeof meta.overall_score === "number" ? meta.overall_score : null;
  let status: string, riskLabel: string, score: number;
  if (verdict === "BLOCK") {
    status = "INTERCEPTED"; riskLabel = "CRITICAL"; score = rawScore ?? 0.91;
  } else if (verdict === "REVIEW" || verdict === "WARN") {
    status = "FLAGGED"; riskLabel = "ELEVATED"; score = rawScore ?? 0.62;
  } else {
    status = "PASSED"; riskLabel = rawScore != null && rawScore > 0.45 ? "ELEVATED" : "LOW";
    score = rawScore ?? 0.09;
  }
  const ts = r.created_at
    ? new Date(r.created_at).toLocaleTimeString("en-US", { hour12: false })
    : "--:--:--";
  const shortId = `AUD-${r.id.slice(-6).toUpperCase()}`;
  const action = r.action_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const model = (meta.model as string) || r.entity_type || "—";
  return { ts, id: shortId, action, model, score, riskLabel, status };
}

/* ─── Ops feed data ─── */
const feedItems = [
  { dot: "#7c3aed", title: "Auto-Update Complete", body: "Global Policy v4.2.1 deployed." },
  { dot: "#10b981", title: "Backup Verified", body: "Hourly snapshot stored securely." },
  { dot: "#06b6d4", title: "New Audit Started", body: "Finance-Core-LLM scan initiated." },
  { dot: "#f59e0b", title: "Flagged Request", body: "Prompt injection attempt logged." },
];

/* ─── Mock audit rows ─── */
const MOCK_ROWS = [
  {
    ts: "09:42:07",
    id: "AUD-920-X1",
    action: "PII redaction attempt",
    model: "Finance-Core-LLM",
    score: 0.08,
    riskLabel: "LOW",
    status: "PASSED",
  },
  {
    ts: "09:41:33",
    id: "AUD-920-K4",
    action: "Unauthorized Vector Injection",
    model: "Internal-RAG-A1",
    score: 0.94,
    riskLabel: "CRITICAL",
    status: "INTERCEPTED",
  },
  {
    ts: "09:40:55",
    id: "AUD-919-L0",
    action: "Prompt Injection (Level 2)",
    model: "Customer-Bot-Prod",
    score: 0.62,
    riskLabel: "ELEVATED",
    status: "FLAGGED",
  },
  {
    ts: "09:39:14",
    id: "AUD-919-J7",
    action: "Mass Token Consumption",
    model: "Developer-Sandbox",
    score: 0.12,
    riskLabel: "LOW",
    status: "PASSED",
  },
];

const statusMeta: Record<string, { bg: string; text: string; border: string }> = {
  PASSED:      { bg: "rgba(16,185,129,0.1)",  text: "#10b981", border: "rgba(16,185,129,0.25)" },
  INTERCEPTED: { bg: "rgba(244,63,94,0.1)",   text: "#f43f5e", border: "rgba(244,63,94,0.25)" },
  FLAGGED:     { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", border: "rgba(245,158,11,0.25)" },
};

const riskColor: Record<string, string> = {
  LOW: "#10b981", ELEVATED: "#f59e0b", CRITICAL: "#f43f5e",
};

/* ─── Bar chart data ─── */
const BAR_DATA = [
  { h: "40%", op: 0.20, tip: "12k RPS", peak: false },
  { h: "45%", op: 0.22, tip: null,      peak: false },
  { h: "55%", op: 0.28, tip: null,      peak: false },
  { h: "75%", op: 0.38, tip: null,      peak: false },
  { h: "60%", op: 0.28, tip: null,      peak: false },
  { h: "85%", op: 0.48, tip: null,      peak: false },
  { h: "70%", op: 0.38, tip: null,      peak: false },
  { h: "95%", op: 0.60, tip: "Peak: 24.2k", peak: true },
  { h: "65%", op: 0.38, tip: null,      peak: false },
  { h: "50%", op: 0.28, tip: null,      peak: false },
  { h: "40%", op: 0.20, tip: null,      peak: false },
  { h: "70%", op: 0.42, tip: null,      peak: false },
  { h: "60%", op: 0.32, tip: null,      peak: false },
  { h: "45%", op: 0.24, tip: null,      peak: false },
  { h: "35%", op: 0.18, tip: null,      peak: false },
  { h: "50%", op: 0.28, tip: null,      peak: false },
];

/* ─── Page ─── */
export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sdkStats, setSdkStats] = useState<SdkStats | null>(null);
  const [timeseries, setTimeseries] = useState<TimePoint[]>([]);
  const [, setOutcomes] = useState<OutcomeRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRecord[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [feedIdx, setFeedIdx] = useState(0);
  const [feedVisible, setFeedVisible] = useState(true);
  const [activeFilter, setActiveFilter] = useState(0);
  const [hovRow, setHovRow] = useState<number | null>(null);
  const prevSummaryRef = useRef<Summary | null>(null);

  async function load(r: TimeRange) {
    try {
      const [s, ts, oc, sdk, auditData] = await Promise.all([
        fetch(`/api/analytics?path=summary&range=${r}`).then((x) => x.json()),
        fetch(`/api/analytics?path=timeseries&range=${r}`).then((x) => x.json()),
        fetch(`/api/analytics?path=outcomes&range=${r}`).then((x) => x.json()),
        fetch(`/api/sdk-stats?range=${r}`).then((x) => x.json()).catch(() => null),
        fetch(`/api/audit-trails?limit=10`).then((x) => x.json()).catch(() => null),
      ]);
      if (!s.error) {
        setSummary(s);
        prevSummaryRef.current = s;
      }
      setTimeseries(Array.isArray(ts) ? ts : []);
      setOutcomes(Array.isArray(oc) ? oc : []);
      if (sdk && !sdk.error) setSdkStats(sdk);
      if (auditData && Array.isArray(auditData.records)) {
        setAuditRows(auditData.records);
        setAuditTotal(auditData.total ?? 0);
      }
    } catch { /* silent */ }
  }

  useEffect(() => { load(range); }, [range]);

  // SSE live updates
  useEffect(() => {
    const coreUrl = process.env.NEXT_PUBLIC_VELDRIX_CORE_URL ?? "http://localhost:8001";
    let es: EventSource;
    try {
      es = new EventSource(`${coreUrl}/api/v1/stream`);
      es.addEventListener("analysis_complete", () => { load(range); });
    } catch { /* SSE not available */ }
    return () => { if (es) es.close(); };
  }, [range]);

  // Ops feed cycling
  useEffect(() => {
    const id = setInterval(() => {
      setFeedVisible(false);
      setTimeout(() => {
        setFeedIdx((i) => (i + 1) % feedItems.length);
        setFeedVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  // Metric counter: Total Audited
  useEffect(() => {
    if (!summary) return;
    const el = document.getElementById("stat-total");
    if (!el) return;
    const target = summary.total_evaluations;
    let v = 0;
    const step = target / 60;
    const id = setInterval(() => {
      v = Math.min(v + step, target);
      el.textContent = target >= 1000
        ? (v / 1000).toFixed(1) + "k"
        : Math.floor(v).toLocaleString();
      if (v >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [summary?.total_evaluations]);

  // Metric counter: Violations
  useEffect(() => {
    if (!summary) return;
    const el = document.getElementById("stat-violations");
    if (!el) return;
    const target = summary.failed;
    let v = 0;
    const step = Math.max(target / 60, 1);
    const id = setInterval(() => {
      v = Math.min(v + step, target);
      el.textContent = Math.floor(v).toLocaleString();
      if (v >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [summary?.failed]);

  // Metric counter: Compliance
  useEffect(() => {
    if (!summary) return;
    const el = document.getElementById("stat-compliance");
    if (!el) return;
    const target = summary.approval_rate;
    let v = 0;
    const step = target / 60;
    const id = setInterval(() => {
      v = Math.min(v + step, target);
      el.textContent = v.toFixed(1) + "%";
      if (v >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [summary?.approval_rate]);

  // Derived display values
  const totalDisplay = summary
    ? (summary.total_evaluations >= 1000
      ? (summary.total_evaluations / 1000).toFixed(1) + "k"
      : summary.total_evaluations.toLocaleString())
    : "428.9k";
  const violationsDisplay = summary ? summary.failed.toLocaleString() : "1,242";
  const latencyDisplay = summary?.avg_latency_ms != null ? `${summary.avg_latency_ms}ms` : "14ms";
  const complianceDisplay = summary ? `${summary.approval_rate.toFixed(1)}%` : "99.8%";

  const latencyOk = summary?.avg_latency_ms == null || summary.avg_latency_ms <= 200;

  // Derive live ops feed from real audit rows, fall back to static items
  const liveFeedItems = auditRows.length > 0
    ? auditRows.slice(0, 4).map(mapAuditRow).map((r) => ({
        dot: r.status === "INTERCEPTED" ? "#f43f5e" : r.status === "FLAGGED" ? "#f59e0b" : "#10b981",
        title: r.action,
        body: `${r.model} · ${r.ts}`,
      }))
    : feedItems;
  const feedItem = liveFeedItems[feedIdx % liveFeedItems.length];

  // Real latency for HUD
  const hudLatencyMs = sdkStats?.avg_latency_ms ?? summary?.avg_latency_ms ?? null;
  const hudLatencyLabel = hudLatencyMs != null ? `${hudLatencyMs.toFixed(1)}ms` : "—";
  const hudLatencyWidth = hudLatencyMs != null
    ? `${Math.min(Math.max((hudLatencyMs / 300) * 100, 5), 100)}%`
    : "65%";
  const hudLatencyColor = hudLatencyMs == null ? "rgba(240,242,255,0.6)"
    : hudLatencyMs <= 100 ? "#10b981"
    : hudLatencyMs <= 250 ? "#f59e0b"
    : "#f43f5e";

  // Real priority incident (first INTERCEPTED or CRITICAL from all audit rows)
  const priorityIncident = auditRows.map(mapAuditRow).find(
    (r) => r.status === "INTERCEPTED" || r.riskLabel === "CRITICAL"
  ) ?? null;

  // Bar chart: derive from real timeseries, fall back to static BAR_DATA
  const barData = timeseries.length > 0 ? (() => {
    const pts = timeseries.slice(-16);
    const maxReq = Math.max(...pts.map((p) => p.requests), 1);
    const peakIdx = pts.reduce((mi, p, i) => (p.requests > pts[mi].requests ? i : mi), 0);
    return pts.map((p, i) => ({
      h: `${Math.max(Math.round((p.requests / maxReq) * 90), 5)}%`,
      op: 0.15 + (p.requests / maxReq) * 0.5,
      tip: i === peakIdx ? `Peak: ${p.requests.toLocaleString()}` : null,
      peak: i === peakIdx,
    }));
  })() : BAR_DATA;

  // Filter audit rows by active tab
  const displayRows = auditRows.map(mapAuditRow).filter((r) => {
    if (activeFilter === 1) return r.riskLabel === "CRITICAL";
    if (activeFilter === 2) return r.status === "INTERCEPTED" || r.status === "FLAGGED";
    return true;
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Page heading */}
        <div className="section-reveal" style={{ marginBottom: "36px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "34px", letterSpacing: "-1px", color: "#f0f2ff", marginBottom: "8px", lineHeight: 1.1 }}>
              Audit Intelligence
              <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "18px", color: "rgba(240,242,255,0.4)", marginLeft: "12px", letterSpacing: 0 }}>
                Operations Edition
              </span>
            </h2>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "14px", color: "rgba(240,242,255,0.5)", maxWidth: "560px", lineHeight: 1.6 }}>
              Real-time governance monitoring for enterprise-scale LLM throughput. Command and control interface for policy enforcement.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <div style={{ display: "inline-flex", border: "1px solid rgba(124,58,237,0.12)", borderRadius: "8px", overflow: "hidden" }}>
              {(["7d", "14d", "30d"] as TimeRange[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} style={{
                  padding: "8px 14px", fontSize: "10px", fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", border: "none",
                  background: range === r ? "#7c3aed" : "rgba(255,255,255,0.03)",
                  color: range === r ? "white" : "rgba(240,242,255,0.4)",
                  cursor: "pointer", transition: "all 0.15s",
                  borderRight: r !== "30d" ? "1px solid rgba(124,58,237,0.12)" : "none",
                }}>
                  {r}
                </button>
              ))}
            </div>
            <GlassButton>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Report
            </GlassButton>
          </div>
        </div>

        {/* ── 4 Metric cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
          {/* Card 1 */}
          <MetricCard
            animClass="mr-1"
            label="Total Audited"
            valueId="stat-total"
            valueDefault={totalDisplay}
            valueColor="#7c3aed"
            trendColor="#10b981"
            trendIcon={<TrendUp />}
            trendText="+12.4% FROM YESTERDAY"
            bgIcon={<BigBarChart />}
          />
          {/* Card 2 */}
          <MetricCard
            animClass="mr-2"
            label="Violations"
            valueId="stat-violations"
            valueDefault={violationsDisplay}
            valueColor="#f43f5e"
            trendColor="#f43f5e"
            trendIcon={<TrendAlert />}
            trendText="CRITICAL ACTION REQ"
            bgIcon={<BigAlert />}
          />
          {/* Card 3 */}
          <MetricCard
            animClass="mr-3"
            label="Avg Latency"
            valueId={null}
            valueDefault={latencyDisplay}
            valueColor={latencyOk ? "rgba(240,242,255,0.8)" : "#f43f5e"}
            trendColor="rgba(240,242,255,0.3)"
            trendIcon={null}
            trendText="OPTIMIZED PERFORMANCE"
            bgIcon={<BigClock />}
          />
          {/* Card 4 */}
          <MetricCard
            animClass="mr-4"
            label="Compliance"
            valueId="stat-compliance"
            valueDefault={complianceDisplay}
            valueColor="#10b981"
            trendColor="#10b981"
            trendIcon={null}
            trendText="STABLE OPERATIONS"
            bgIcon={<BigShield />}
          />
        </div>

        {/* ── Traffic Velocity Bar Chart ── */}
        <div className="section-reveal" style={{ animationDelay: "0.3s", marginBottom: "24px" }}>
          <div style={{ background: "#0a0c15", borderRadius: "24px", padding: "28px", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
              <div>
                <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "17px", color: "#f0f2ff", marginBottom: "4px" }}>Traffic Velocity</h4>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)" }}>
                  Requests per second · Live stream
                </p>
              </div>
              <div style={{ display: "flex", gap: "20px", fontSize: "11px", fontFamily: "DM Sans, sans-serif", fontWeight: 600 }}>
                {[["#7c3aed", "Incoming"], ["#10b981", "Processed"]].map(([col, lbl]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: col, display: "inline-block" }}/>
                    <span style={{ color: "rgba(240,242,255,0.4)", textTransform: "uppercase", letterSpacing: "1px" }}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: "220px", display: "flex", alignItems: "flex-end", gap: "5px", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(124,58,237,0.06), transparent)", borderRadius: "8px", pointerEvents: "none" }}/>
              {barData.map((bar, i) => (
                <div
                  key={i}
                  className={`bar-grow bg-${i + 1}`}
                  style={{
                    flex: 1, height: bar.h, borderRadius: "4px 4px 0 0",
                    background: `rgba(124,58,237,${bar.op})`,
                    boxShadow: bar.peak ? "0 0 20px rgba(124,58,237,0.4)" : undefined,
                    position: "relative",
                  }}
                >
                  {bar.tip && (
                    <div style={{
                      position: "absolute", top: "-34px", left: "50%", transform: "translateX(-50%)",
                      background: "#111422", border: "1px solid rgba(124,58,237,0.3)",
                      borderRadius: "6px", padding: "3px 8px", fontSize: "10px",
                      fontFamily: "JetBrains Mono, monospace", color: "#f0f2ff", whiteSpace: "nowrap",
                    }}>
                      {bar.tip}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Ambient glow */}
            <div style={{ position: "absolute", bottom: "-60px", right: "-60px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(124,58,237,0.05)", filter: "blur(80px)", pointerEvents: "none" }}/>

            {/* SDK stats overlay if available */}
            {sdkStats && sdkStats.total_requests > 0 && (
              <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "32px", flexWrap: "wrap" }}>
                {[
                  { label: "SDK Requests", val: sdkStats.total_requests.toString(), color: "#7c3aed" },
                  { label: "Avg Trust Score", val: (sdkStats.avg_trust_score * 100).toFixed(1) + "%", color: sdkStats.avg_trust_score >= 0.85 ? "#10b981" : "#f59e0b" },
                  { label: "SDK Latency", val: sdkStats.avg_latency_ms + "ms", color: "#06b6d4" },
                  { label: "Blocked", val: (sdkStats.verdict_breakdown.BLOCK || 0).toString(), color: "#f43f5e" },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "18px", color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Active Audit Stream Table ── */}
        <div className="section-reveal" style={{ animationDelay: "0.5s", background: "#0d0f1a", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Table toolbar */}
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10,12,21,0.5)", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "15px", color: "#f0f2ff", whiteSpace: "nowrap" }}>Active Audit Stream</h4>
              <div style={{ display: "flex", gap: "6px" }}>
                {["All Logs", "Critical Only", "Blocked Requests"].map((f, fi) => (
                  <button key={f} onClick={() => setActiveFilter(fi)} style={{
                    padding: "5px 12px", borderRadius: "8px", fontSize: "10px",
                    fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px",
                    textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s", border: "none",
                    background: activeFilter === fi ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                    color: activeFilter === fi ? "#7c3aed" : "rgba(240,242,255,0.35)",
                    outline: activeFilter === fi ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/dashboard/audit-trails" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, color: "#7c3aed", textDecoration: "none" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              View All
            </Link>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                <tr>
                  {["Timestamp", "Audit ID", "Action Pattern", "Risk Score", "Status", ""].map((col) => (
                    <th key={col} style={{ padding: "12px 20px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.3)" }}>No audit records found</td></tr>
                ) : displayRows.map((row, ri) => {
                  const sm = statusMeta[row.status] ?? statusMeta.PASSED;
                  return (
                    <tr
                      key={row.id}
                      className={`row-in ri-${ri + 1} audit-row`}
                      onMouseEnter={() => setHovRow(ri)}
                      onMouseLeave={() => setHovRow(null)}
                      style={{ background: hovRow === ri ? "rgba(255,255,255,0.025)" : ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}
                    >
                      <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.35)", whiteSpace: "nowrap" }}>
                        {row.ts}
                      </td>
                      <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "12px", color: "#7c3aed", whiteSpace: "nowrap" }}>
                        {row.id}
                      </td>
                      <td style={{ padding: "14px 20px", color: "rgba(240,242,255,0.75)" }}>
                        <div>{row.action}</div>
                        <div style={{ fontSize: "11px", color: "rgba(240,242,255,0.3)", marginTop: "2px", fontFamily: "JetBrains Mono, monospace" }}>{row.model}</div>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "60px", height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ width: `${row.score * 100}%`, height: "100%", background: riskColor[row.riskLabel], borderRadius: "2px" }}/>
                          </div>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: riskColor[row.riskLabel], fontWeight: 600 }}>
                            {row.score.toFixed(2)} <span style={{ fontSize: "9px", letterSpacing: "1px" }}>{row.riskLabel}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: sm.bg, color: sm.text, border: `1px solid ${sm.border}`, whiteSpace: "nowrap" }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <button className="row-action" style={{
                          padding: "5px 10px", borderRadius: "7px", fontSize: "10px",
                          fontFamily: "DM Sans, sans-serif", fontWeight: 600,
                          background: "rgba(124,58,237,0.12)", color: "#a78bfa",
                          border: "1px solid rgba(124,58,237,0.2)", cursor: "pointer",
                        }}>
                          Open ↗
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10,12,21,0.3)" }}>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)" }}>
              {auditTotal > 0 ? `Viewing 1–${Math.min(10, auditRows.length)} of ${auditTotal.toLocaleString()} records` : "Viewing audit stream"}
            </p>
            <div style={{ display: "flex", gap: "4px" }}>
              {["‹", "1", "2", "3", "›"].map((p, pi) => (
                <button key={pi} style={{
                  width: "28px", height: "28px", borderRadius: "6px", fontSize: "12px",
                  fontFamily: "DM Sans, sans-serif", fontWeight: 600,
                  background: p === "1" ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.03)",
                  color: p === "1" ? "#7c3aed" : "rgba(240,242,255,0.35)",
                  border: p === "1" ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right HUD Panel ── */}
      <aside style={{
        width: "280px",
        flexShrink: 0,
        display: "flex", flexDirection: "column", gap: "0",
      }}>

        <h5 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "20px" }}>
          System Health HUD
        </h5>

        {/* Health bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "28px" }}>
          <HealthBar label="Encryption Engine" value="STABLE" valueColor="#10b981" width="100%" barColor="#10b981" delay="hb-1" />
          <HealthBar label="Tokenizer Latency" value={hudLatencyLabel} valueColor={hudLatencyColor} width={hudLatencyWidth} barColor={hudLatencyColor} delay="hb-2" />
          <HealthBar label="Policy Engine" value={summary ? "ACTIVE" : "—"} valueColor="#06b6d4" width={summary ? "88%" : "20%"} barColor="#06b6d4" delay="hb-3" />
        </div>

        {/* Priority Incident */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "24px", marginBottom: "24px" }}>
          <h5 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "14px" }}>
            Priority Incident
          </h5>
          {priorityIncident ? (
            <div className="incident-pulse glass-panel" style={{ padding: "16px", borderRadius: "14px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#f43f5e">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" fill="none"/>
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" strokeWidth="2" fill="none"/>
                </svg>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, color: "#f43f5e", letterSpacing: "2px", textTransform: "uppercase" }}>
                  {priorityIncident.status}
                </span>
              </div>
              <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.6)", lineHeight: 1.6, marginBottom: "6px" }}>
                {priorityIncident.action}
              </p>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(240,242,255,0.35)", marginBottom: "14px" }}>
                {priorityIncident.model} · {priorityIncident.id}
              </p>
              <button style={{ width: "100%", padding: "8px", background: "#f43f5e", color: "white", border: "none", borderRadius: "8px", fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", transition: "opacity 0.2s" }}>
                Review &rarr;
              </button>
            </div>
          ) : (
            <div style={{ padding: "16px", borderRadius: "14px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} className="live-dot" />
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.5)" }}>
                No active threats detected
              </span>
            </div>
          )}
        </div>

        {/* Operations Feed */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "24px", marginBottom: "24px" }}>
          <h5 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "16px" }}>
            Operations Feed
          </h5>
          <div style={{ transition: "opacity 0.4s", opacity: feedVisible ? 1 : 0 }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: feedItem.dot, marginTop: "5px", flexShrink: 0 }} className="live-dot"/>
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#f0f2ff", marginBottom: "3px" }}>{feedItem.title}</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.45)", lineHeight: 1.5 }}>{feedItem.body}</div>
              </div>
            </div>
          </div>
          {/* Feed dots */}
          <div style={{ display: "flex", gap: "6px", marginTop: "16px", justifyContent: "center" }}>
            {liveFeedItems.map((_, fi) => (
              <div key={fi} style={{ width: fi === feedIdx % liveFeedItems.length ? "16px" : "6px", height: "6px", borderRadius: "3px", background: fi === feedIdx % liveFeedItems.length ? "#7c3aed" : "rgba(255,255,255,0.1)", transition: "all 0.3s" }}/>
            ))}
          </div>
        </div>

        {/* Service status */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${summary ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)"}`, borderRadius: "16px", padding: "20px", textAlign: "center" }}>
          <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "14px" }}>
            Service Status
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "5px", alignItems: "flex-end" }}>
            {[24, 32, 24, 36, 20].map((h, i) => (
              <div key={i} className="hbar-fill" style={{ width: "6px", height: `${h}px`, background: summary ? "#10b981" : "rgba(255,255,255,0.2)", borderRadius: "3px", opacity: [0.4, 1, 0.7, 0.9, 0.5][i], animationDelay: `${i * 0.1 + 0.8}s` }}/>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: "12px" }}>
            {summary && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} className="live-dot" />}
            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", fontWeight: 700, color: summary ? "#10b981" : "rgba(240,242,255,0.3)", letterSpacing: "2px" }}>
              {summary ? "OPERATIONAL" : "CONNECTING…"}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ─── Sub-components ─── */

function MetricCard({ animClass, label, valueId, valueDefault, valueColor, trendColor, trendIcon, trendText, bgIcon }: {
  animClass: string;
  label: string;
  valueId: string | null;
  valueDefault: string;
  valueColor: string;
  trendColor: string;
  trendIcon: React.ReactNode;
  trendText: string;
  bgIcon: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      className={`glass-panel metric-reveal ${animClass}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "22px", borderRadius: "20px", position: "relative", overflow: "hidden",
        transition: "all 0.3s",
        boxShadow: hov ? "0 8px 32px rgba(124,58,237,0.1)" : undefined,
        background: hov ? "rgba(255,255,255,0.04)" : "rgba(13,15,26,0.65)",
      }}
    >
      <div style={{ position: "absolute", top: "12px", right: "12px", opacity: 0.06 }}>
        {bgIcon}
      </div>
      <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: "8px" }}>
        {label}
      </p>
      <h3 id={valueId ?? undefined} style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "28px", color: valueColor, letterSpacing: "-1px" }}>
        {valueDefault}
      </h3>
      <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, color: trendColor, letterSpacing: "1px" }}>
        {trendIcon}
        {trendText}
      </div>
    </div>
  );
}

function HealthBar({ label, value, valueColor, width, barColor, delay }: {
  label: string; value: string; valueColor: string; width: string; barColor: string; delay: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)" }}>{label}</span>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px", fontWeight: 700, color: valueColor }}>{value}</span>
      </div>
      <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
        <div className={`hbar-fill ${delay}`} style={{ height: "100%", width, background: barColor, borderRadius: "2px" }}/>
      </div>
    </div>
  );
}

function GlassButton({ children }: { children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      className="glass-panel"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "9px 16px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "7px",
        fontFamily: "DM Sans, sans-serif", fontSize: "12px", fontWeight: 600,
        color: hov ? "#f0f2ff" : "rgba(240,242,255,0.7)", cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.08)", transition: "all 0.2s", background: "none",
      }}
    >
      {children}
    </button>
  );
}

/* Icon helpers for metric cards */
const BigBarChart = () => (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
  </svg>
);
const BigAlert = () => (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const BigClock = () => (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(240,242,255,0.5)" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const BigShield = () => (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);
const TrendUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);
const TrendAlert = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/>
  </svg>
);
