"use client";

import { useState, useEffect, useRef } from "react";

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



const statusMeta: Record<string, { bg: string; text: string; border: string }> = {
  PASSED:      { bg: "rgba(16,185,129,0.1)",  text: "#10b981", border: "rgba(16,185,129,0.25)" },
  INTERCEPTED: { bg: "rgba(244,63,94,0.1)",   text: "#f43f5e", border: "rgba(244,63,94,0.25)" },
  FLAGGED:     { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", border: "rgba(245,158,11,0.25)" },
};

const riskColor: Record<string, string> = {
  LOW: "#10b981", ELEVATED: "#f59e0b", CRITICAL: "#f43f5e",
};


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

  // Polling: refresh analytics every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => load(range), 30000);
    return () => clearInterval(interval);
  }, [range]);

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
        setFeedIdx((i) => i + 1);
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
    : "—";
  const violationsDisplay = summary ? summary.failed.toLocaleString() : "—";
  const latencyDisplay = summary?.avg_latency_ms != null ? `${summary.avg_latency_ms}ms` : "—";
  const complianceDisplay = summary ? `${summary.approval_rate.toFixed(1)}%` : "—";

  const latencyOk = summary?.avg_latency_ms == null || summary.avg_latency_ms <= 200;

  // Ops feed: only from real audit rows; empty state when no data yet
  const liveFeedItems = auditRows.slice(0, 4).map(mapAuditRow).map((r) => ({
    dot: r.status === "INTERCEPTED" ? "#f43f5e" : r.status === "FLAGGED" ? "#f59e0b" : "#10b981",
    title: r.action,
    body: `${r.model} · ${r.ts}`,
  }));
  const feedItem = liveFeedItems.length > 0
    ? liveFeedItems[feedIdx % liveFeedItems.length]
    : null;

  // Real latency for HUD
  const hudLatencyMs = sdkStats?.avg_latency_ms ?? summary?.avg_latency_ms ?? null;
  const hudLatencyLabel = hudLatencyMs != null ? `${hudLatencyMs.toFixed(1)}ms` : "—";
  const hudLatencyWidth = hudLatencyMs != null
    ? `${Math.min(Math.max((hudLatencyMs / 300) * 100, 5), 100)}%`
    : "0%";
  const hudLatencyColor = hudLatencyMs == null ? "rgba(240,242,255,0.3)"
    : hudLatencyMs <= 100 ? "#10b981"
    : hudLatencyMs <= 250 ? "#f59e0b"
    : "#f43f5e";

  // Real priority incident (first INTERCEPTED or CRITICAL from all audit rows)
  const priorityIncident = auditRows.map(mapAuditRow).find(
    (r) => r.status === "INTERCEPTED" || r.riskLabel === "CRITICAL"
  ) ?? null;

  // Bar chart: only from real timeseries data; no static fallback
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
  })() : [];

  // Trend vs prior period: compare first half vs second half of timeseries
  function calcTrend(field: "requests" | "approved" | "blocked"): string {
    if (summary && summary.total_evaluations > 0) return "NEW ACTIVITY";
    if (timeseries.length < 2) return "NO DATA YET";
    const mid = Math.floor(timeseries.length / 2);
    const prev = timeseries.slice(0, mid).reduce((s, p) => s + p[field], 0);
    const curr = timeseries.slice(mid).reduce((s, p) => s + p[field], 0);
    if (prev === 0) return curr > 0 ? "NEW ACTIVITY" : "NO DATA YET";
    const pct = ((curr - prev) / prev) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}% VS PRIOR PERIOD`;
  }

  const totalTrend   = calcTrend("requests");
  const violationsTrend = summary && summary.failed > 0 ? "REVIEW FLAGGED" : "NO VIOLATIONS";
  const complianceTrend = summary
    ? (summary.approval_rate >= 95 ? "STABLE OPERATIONS" : summary.approval_rate >= 80 ? "MONITOR ADVISED" : "ACTION REQUIRED")
    : "AWAITING DATA";

  return (
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
            trendText={totalTrend}
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
            trendText={violationsTrend}
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
            trendText={latencyOk ? "OPTIMIZED PERFORMANCE" : "HIGH LATENCY DETECTED"}
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
            trendText={complianceTrend}
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

            <div style={{ height: "220px", display: "flex", alignItems: barData.length === 0 ? "center" : "flex-end", justifyContent: barData.length === 0 ? "center" : undefined, gap: "5px", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(124,58,237,0.06), transparent)", borderRadius: "8px", pointerEvents: "none" }}/>
              {barData.length === 0 && (
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.2)", letterSpacing: "2px", textTransform: "uppercase", position: "relative" }}>
                  No traffic data for this period
                </p>
              )}
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

        {/* ── System Health HUD (moved from right panel into main content) ── */}
        <section className="section-reveal" style={{ animationDelay: "0.5s" }}>
          <div style={{ background: "#0a0c15", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", padding: "28px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
              <div>
                <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "16px", color: "#f0f2ff", marginBottom: "4px" }}>System Health</h4>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)" }}>Live infrastructure telemetry</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="live-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}/>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", fontWeight: 700, color: "#10b981", letterSpacing: "2px" }}>{summary ? "OPERATIONAL" : "CONNECTING…"}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px", alignItems: "start" }}>
              {/* Column 1: Engine Status */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "4px" }}>Engine Status</p>
                <HealthBar label="Encryption Engine" value="STABLE" valueColor="#10b981" width="100%" barColor="#10b981" delay="hb-1" />
                <HealthBar label="Tokenizer Latency" value={hudLatencyLabel} valueColor={hudLatencyColor} width={hudLatencyWidth} barColor={hudLatencyColor} delay="hb-2" />
                <HealthBar label="Policy Engine" value={summary ? "ACTIVE" : "—"} valueColor="#06b6d4" width={summary ? "88%" : "20%"} barColor="#06b6d4" delay="hb-3" />
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "16px", display: "flex", alignItems: "center", gap: "16px", marginTop: "4px" }}>
                  <div style={{ display: "flex", gap: "3px", alignItems: "flex-end" }}>
                    {[24, 32, 24, 36, 20].map((h, i) => (
                      <div key={i} className="hbar-fill" style={{ width: "5px", height: `${h}px`, background: summary ? "#10b981" : "rgba(255,255,255,0.2)", borderRadius: "2px", opacity: [0.4, 1, 0.7, 0.9, 0.5][i], animationDelay: `${0.3 + i * 0.1}s` }}/>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", fontWeight: 700, color: summary ? "#10b981" : "rgba(240,242,255,0.3)", letterSpacing: "2px" }}>ALL SYSTEMS</div>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", color: "rgba(240,242,255,0.3)", letterSpacing: "1px", textTransform: "uppercase", marginTop: "2px" }}>Operational</div>
                  </div>
                </div>
              </div>
              {/* Column 2: Priority Incident */}
              <div>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "16px" }}>Priority Incident</p>
                {priorityIncident ? (
                  <div className="glass-panel incident-pulse" style={{ padding: "16px", borderRadius: "14px", background: "rgba(244,63,94,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#f43f5e">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" fill="none"/>
                        <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" strokeWidth="2" fill="none"/>
                      </svg>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, color: "#f43f5e", letterSpacing: "2px", textTransform: "uppercase" }}>{priorityIncident.status}</span>
                    </div>
                    <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.55)", lineHeight: 1.6, marginBottom: "6px" }}>{priorityIncident.action}</p>
                    <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(240,242,255,0.35)", marginBottom: "14px" }}>{priorityIncident.model} · {priorityIncident.id}</p>
                    <button style={{ width: "100%", padding: "8px", background: "#f43f5e", color: "white", border: "none", borderRadius: "8px", fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", transition: "opacity 0.2s" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                      Review →
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: "16px", borderRadius: "14px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} className="live-dot" />
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.5)" }}>No active threats detected</span>
                  </div>
                )}
              </div>
              {/* Column 3: Operations Feed */}
              <div>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)", marginBottom: "16px" }}>Operations Feed</p>
                {feedItem ? (
                  <>
                    <div style={{ transition: "opacity 0.4s", opacity: feedVisible ? 1 : 0 }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: feedItem.dot, marginTop: "5px", flexShrink: 0 }} className="live-dot"/>
                        <div>
                          <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#f0f2ff", marginBottom: "3px" }}>{feedItem.title}</div>
                          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.45)", lineHeight: 1.5 }}>{feedItem.body}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "16px" }}>
                      {liveFeedItems.map((_, fi) => (
                        <div key={fi} style={{ width: fi === feedIdx % liveFeedItems.length ? "16px" : "6px", height: "6px", borderRadius: "3px", background: fi === feedIdx % liveFeedItems.length ? "#7c3aed" : "rgba(255,255,255,0.1)", transition: "all 0.3s" }}/>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 0" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(240,242,255,0.15)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.3)" }}>No recent activity</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
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
