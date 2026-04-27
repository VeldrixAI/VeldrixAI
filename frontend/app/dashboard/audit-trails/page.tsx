"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

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

type PageData = { total: number; page: number; limit: number; records: AuditRecord[] };

const ACTION_TYPES = ["create_report", "delete_report", "trust_evaluation", "create_api_key", "revoke_api_key", "login", "logout"];

function deduplicateById<T extends { id: string | number }>(records: T[]): T[] {
  const seen = new Map<string | number, T>();
  for (const record of records) {
    if (!seen.has(record.id)) seen.set(record.id, record);
  }
  return Array.from(seen.values());
}

const SYSTEM_ACTION_TYPES = new Set(["create_report", "delete_report"]);

const VERDICT_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  ALLOW:  { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", color: "#10b981" },
  WARN:   { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#f59e0b" },
  REVIEW: { bg: "rgba(6,182,212,0.12)",  border: "rgba(6,182,212,0.3)",  color: "#06b6d4" },
  BLOCK:  { bg: "rgba(244,63,94,0.12)",  border: "rgba(244,63,94,0.3)",  color: "#f43f5e" },
};

function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function fmtShort(ts: string) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditTrailsPage() {
  const router = useRouter();
  const [data, setData] = useState<PageData | null>(null);
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [pdfDone, setPdfDone] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
  const [systemLogs, setSystemLogs] = useState<AuditRecord[]>([]);
  const [systemLogsOpen, setSystemLogsOpen] = useState(false);
  const fetchingRef = useRef(false);

  function showToast(message: string, type = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  const load = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (actionType) params.set("action_type", actionType);
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/audit-trails?${params}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit trails");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [page, actionType, search]);

  useEffect(() => { load(); }, [load]);

  // Fetch system action logs (REPORT_CREATED, REPORT_DELETED)
  useEffect(() => {
    async function loadSystemLogs() {
      try {
        const res = await fetch(`/api/audit-trails?limit=50&action_type=create_report`);
        const res2 = await fetch(`/api/audit-trails?limit=50&action_type=delete_report`);
        const p1 = res.ok ? await res.json() : { records: [] };
        const p2 = res2.ok ? await res2.json() : { records: [] };
        const combined = [...(p1.records || []), ...(p2.records || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setSystemLogs(deduplicateById(combined));
      } catch { /* ignore */ }
    }
    loadSystemLogs();
  }, []);

  // SSE: auto-prepend new SDK analysis rows
  useEffect(() => {
    const coreUrl = process.env.NEXT_PUBLIC_VELDRIX_CORE_URL ?? "http://localhost:8001";
    let es: EventSource;
    try {
      es = new EventSource(`${coreUrl}/api/v1/stream`);
      es.addEventListener("analysis_complete", (e: MessageEvent) => {
        try {
          const result = JSON.parse(e.data);
          const newRow: AuditRecord = {
            id: result.request_id,
            action_type: "trust_evaluation",
            entity_type: "sdk_analysis",
            entity_id: null,
            metadata: {
              request_id: result.request_id,
              overall_score: result.trust_score.overall,
              verdict: result.trust_score.verdict,
              pillar_scores: result.trust_score.pillar_scores,
              critical_flags: result.trust_score.critical_flags,
              total_latency_ms: result.total_latency_ms,
              sdk_version: result.sdk_version,
              timestamp: result.timestamp,
            },
            ip_address: null,
            created_at: new Date(result.timestamp * 1000).toISOString(),
            request_id: result.request_id,
          };
          setData((prev) => {
            if (!prev) return prev;
            const merged = [newRow, ...prev.records];
            const seen = new Map<string, AuditRecord>();
            for (const r of merged) {
              const key = r.request_id || r.id;
              if (!seen.has(key)) seen.set(key, r);
            }
            const deduped = Array.from(seen.values()).slice(0, prev.limit);
            return { ...prev, total: prev.total + 1, records: deduped };
          });
        } catch { /* ignore malformed */ }
      });
    } catch { /* SSE not available */ }
    return () => { if (es) es.close(); };
  }, []);

  async function exportCSV() {
    const params = new URLSearchParams({ export: "1" });
    if (actionType) params.set("action_type", actionType);
    const res = await fetch(`/api/audit-trails?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generatePdf(r: AuditRecord, e: React.MouseEvent) {
    e.stopPropagation();
    const reqId = (r.metadata as Record<string, unknown>)?.request_id as string || r.id;
    if (pdfDone.has(reqId)) return;
    setGeneratingPdf(reqId);
    try {
      const meta = r.metadata as Record<string, unknown> | null;
      const res = await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trust Evaluation — ${(meta?.request_id as string || r.id).slice(0, 8)} — ${new Date(r.created_at).toISOString().slice(0, 10)}`,
          report_type: "trust_evaluation",
          input_payload: meta ?? {},
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
      setPdfDone((prev) => new Set(prev).add(reqId));
      showToast("PDF downloaded — report saved to Reports");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "PDF generation failed", "error");
    } finally {
      setGeneratingPdf(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  // Helper to extract metadata — handles both SSE real-time rows (flat) and
  // DB-persisted trust_evaluation rows (nested under metadata.result)
  function getMeta(r: AuditRecord) {
    const m = (r.metadata || {}) as Record<string, unknown>;
    const result = (m.result as Record<string, unknown>) || {};
    const finalScore = (result.final_score as Record<string, unknown>) || {};

    // SSE rows have flat fields; DB rows nest under .result.
    // Prefer the authoritative top-level r.request_id returned by the backend
    // serializer, then fall back to metadata-embedded copies.
    const requestId =
      r.request_id ||
      (m.request_id as string) ||
      (result.request_id as string) ||
      null;

    // Derive verdict from risk_level if no explicit verdict
    const rawVerdict = (m.verdict as string) || null;
    const riskLevel = (finalScore.risk_level as string) || null;
    const verdict = rawVerdict || (riskLevel ? riskToVerdict(riskLevel) : null);

    // Score: SSE uses 0-1 range, DB uses 0-100 range
    const sseScore = m.overall_score as number | null ?? null;
    const dbScore = finalScore.value as number | null ?? null;
    const overallScore = sseScore ?? (dbScore != null ? dbScore / 100 : null);

    // Latency
    const totalLatencyMs = (m.total_latency_ms as number)
      || (result.execution_time_ms as number)
      || null;

    // Pillar scores: SSE has flat map, DB has nested pillar_results
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

  function riskToVerdict(risk: string): string {
    const r = risk.toLowerCase();
    if (r === "safe" || r === "low") return "ALLOW";
    if (r === "review_required" || r === "medium") return "REVIEW";
    if (r === "high_risk" || r === "high") return "WARN";
    if (r === "critical") return "BLOCK";
    return "REVIEW";
  }

  return (
    <>
      <div style={{ padding: "32px", flex: 1, overflowY: "auto" }}>

        {/* Page heading */}
        <div className="section-reveal" style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "32px", letterSpacing: "-1px", color: "#f0f2ff", marginBottom: "6px" }}>
              Audit Logs
            </h2>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "14px", color: "rgba(240,242,255,0.45)", maxWidth: "500px", lineHeight: 1.6 }}>
              Complete governance audit trail — every request, evaluation, and enforcement action logged in real time.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <svg style={{ position: "absolute", left: "12px", color: "rgba(240,242,255,0.3)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{ paddingLeft: "36px", paddingRight: "14px", paddingTop: "10px", paddingBottom: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "13px", outline: "none", width: "180px", transition: "border-color 0.2s" }}
                onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.4)")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
              />
            </div>
            {/* Action filter */}
            <div style={{ position: "relative" }}>
              <select
                value={actionType}
                onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                style={{ padding: "10px 32px 10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", color: "rgba(240,242,255,0.7)", fontFamily: "DM Sans, sans-serif", fontSize: "13px", outline: "none", appearance: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.4)")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.07)")}
              >
                <option value="">All Actions</option>
                {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <svg style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(240,242,255,0.35)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <button
              onClick={exportCSV}
              className="glass-panel"
              style={{ padding: "10px 18px", borderRadius: "12px", fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 600, color: "rgba(240,242,255,0.6)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: "8px", background: "none", transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "12px", color: "#f43f5e", fontFamily: "DM Sans, sans-serif", fontSize: "13px", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {/* ── Active Audit Stream Table ── */}
        <div className="section-reveal" style={{ animationDelay: "0.2s", background: "#0d0f1a", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Table toolbar */}
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10,12,21,0.5)" }}>
            <h4 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "15px", color: "#f0f2ff" }}>Active Audit Stream</h4>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="live-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}/>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "#10b981", fontWeight: 700, letterSpacing: "1.5px" }}>LIVE</span>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                <tr>
                  {["Request ID", "Action", "Verdict", "Trust Score", "Latency", "Timestamp", ""].map((col) => (
                    <th key={col} style={{ padding: "12px 20px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: "48px", textAlign: "center", fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.3)" }}>
                    <svg style={{ display: "inline-block", animation: "evalSpin 0.8s linear infinite", marginBottom: "8px" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <div>Loading records…</div>
                  </td></tr>
                ) : !data || data.records.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: "48px", textAlign: "center", fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.3)" }}>
                    No audit records yet. SDK analysis calls and actions will appear here automatically.
                  </td></tr>
                ) : (
                  // Filter system action types (create_report, delete_report) to their
                  // own section, then deduplicate by request_id to collapse SSE synthetic
                  // rows and their DB-persisted counterparts for the same evaluation.
                  (() => {
                    const seen = new Set<string>();
                    return data.records
                      .filter(r => !SYSTEM_ACTION_TYPES.has(r.action_type))
                      .filter((r) => {
                        const key = r.request_id || r.id;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                  })().map((r, ri) => {
                    const m = getMeta(r);
                    const isSdk = r.action_type === "trust_evaluation";
                    const vs = m.verdict ? VERDICT_STYLE[m.verdict] : null;
                    const reqId = m.requestId || r.id;
                    const done = pdfDone.has(reqId);

                    return (
                      <tr
                        key={r.id}
                        className={`row-in ri-${Math.min(ri + 1, 8)} audit-row`}
                        onClick={() => {
                          if (isSdk && m.requestId) {
                            router.push(`/dashboard/audit-trails/${m.requestId}`);
                          } else {
                            setSelected(r);
                          }
                        }}
                      >
                        <td style={{ padding: "14px 20px" }}>
                          {m.requestId ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", fontWeight: 700, color: "#7c3aed" }} title={m.requestId}>
                                {m.requestId.slice(0, 8)}
                              </code>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(m.requestId!); }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,242,255,0.3)", padding: "2px", fontSize: "11px", transition: "color 0.2s" }}
                                title="Copy full request ID"
                                onMouseEnter={e => (e.currentTarget.style.color = "#7c3aed")}
                                onMouseLeave={e => (e.currentTarget.style.color = "rgba(240,242,255,0.3)")}
                              >⧉</button>
                            </span>
                          ) : (
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "rgba(240,242,255,0.25)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: "rgba(124,58,237,0.12)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)", whiteSpace: "nowrap" }}>
                            {r.action_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          {vs && m.verdict ? (
                            <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: "6px", fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color, whiteSpace: "nowrap" }}>
                              {m.verdict}
                            </span>
                          ) : <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "rgba(240,242,255,0.25)" }}>—</span>}
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          {m.overallScore != null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ width: "50px", height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ width: `${m.overallScore * 100}%`, height: "100%", background: m.overallScore >= 0.85 ? "#10b981" : m.overallScore >= 0.6 ? "#f59e0b" : "#f43f5e", borderRadius: "2px" }}/>
                              </div>
                              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", fontWeight: 600, color: m.overallScore >= 0.85 ? "#10b981" : m.overallScore >= 0.6 ? "#f59e0b" : "#f43f5e" }}>
                                {(m.overallScore * 100).toFixed(1)}%
                              </span>
                            </div>
                          ) : <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "rgba(240,242,255,0.25)" }}>—</span>}
                        </td>
                        <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.45)", whiteSpace: "nowrap" }}>
                          {m.totalLatencyMs != null ? `${m.totalLatencyMs}ms` : "—"}
                        </td>
                        <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.35)", whiteSpace: "nowrap" }}>
                          {fmtShort(r.created_at)}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {isSdk && (
                              <button
                                onClick={(e) => generatePdf(r, e)}
                                disabled={generatingPdf === reqId || done}
                                className="row-action"
                                style={{
                                  padding: "4px 12px", borderRadius: "7px", fontSize: "10px",
                                  fontFamily: "DM Sans, sans-serif", fontWeight: 600, letterSpacing: "1px",
                                  border: done ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(124,58,237,0.25)",
                                  background: "transparent",
                                  color: done ? "#10b981" : "#a78bfa",
                                  cursor: (generatingPdf === reqId || done) ? "default" : "pointer",
                                  opacity: generatingPdf === reqId ? 0.5 : 1,
                                  transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s", whiteSpace: "nowrap",
                                }}
                              >
                                {generatingPdf === reqId ? "Generating…" : done ? "✓ Ready" : "PDF"}
                              </button>
                            )}
                            <button
                              className="row-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSdk && m.requestId) {
                                  router.push(`/dashboard/audit-trails/${m.requestId}`);
                                } else {
                                  setSelected(r);
                                }
                              }}
                              style={{ padding: "4px 10px", borderRadius: "7px", fontSize: "10px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: "rgba(124,58,237,0.12)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)", cursor: "pointer" }}
                            >
                              {isSdk ? "Analyse ↗" : "Open ↗"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {data && data.total > 0 && (
            <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10,12,21,0.3)" }}>
              <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.25)" }}>
                Viewing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total.toLocaleString()} records
              </p>
              <div style={{ display: "flex", gap: "4px" }}>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ width: "28px", height: "28px", borderRadius: "6px", fontSize: "12px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: "rgba(255,255,255,0.03)", color: page <= 1 ? "rgba(240,242,255,0.15)" : "rgba(240,242,255,0.5)", border: "1px solid rgba(255,255,255,0.06)", cursor: page <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)} style={{ width: "28px", height: "28px", borderRadius: "6px", fontSize: "12px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: p === page ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.03)", color: p === page ? "#7c3aed" : "rgba(240,242,255,0.35)", border: p === page ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{p}</button>
                ))}
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={{ width: "28px", height: "28px", borderRadius: "6px", fontSize: "12px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: "rgba(255,255,255,0.03)", color: page >= totalPages ? "rgba(240,242,255,0.15)" : "rgba(240,242,255,0.5)", border: "1px solid rgba(255,255,255,0.06)", cursor: page >= totalPages ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
              </div>
            </div>
          )}
        </div>
        {/* ── System Action Log ── */}
        <div className="section-reveal" style={{ animationDelay: "0.4s", marginTop: "24px" }}>
          <button
            onClick={() => setSystemLogsOpen((o) => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: systemLogsOpen ? "16px 16px 0 0" : "16px",
              color: "rgba(240,242,255,0.45)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
            }}
          >
            <span>
              {systemLogsOpen ? "↑" : "↓"} System Action Log
              {systemLogs.length > 0 && (
                <span style={{ marginLeft: 8, padding: "2px 8px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, color: "#f59e0b", fontSize: "10px" }}>
                  {systemLogs.length}
                </span>
              )}
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", letterSpacing: "1px", color: "rgba(240,242,255,0.25)" }}>
              REPORT_CREATED · REPORT_DELETED
            </span>
          </button>

          {systemLogsOpen && (
            <div style={{ background: "rgba(10,12,21,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderTop: "none", borderRadius: "0 0 16px 16px", overflow: "hidden" }}>
              {systemLogs.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.2)" }}>
                  No system actions recorded yet.
                </div>
              ) : (
                <table style={{ width: "100%", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: "13px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Type", "Related Request", "Actor", "Timestamp"].map((col) => (
                        <th key={col} style={{ padding: "10px 20px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.2)", borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.map((r) => {
                      const isCreate = r.action_type === "create_report";
                      const borderColor = isCreate ? "#f59e0b" : "#F43F5E";
                      const relatedId = (r.metadata as Record<string, unknown>)?.source_request_id as string | undefined
                        || (r.metadata as Record<string, unknown>)?.request_id as string | undefined;
                      return (
                        <tr key={r.id} style={{ borderLeft: `3px solid ${borderColor}`, opacity: 0.8 }}>
                          <td style={{ padding: "12px 20px" }}>
                            <span style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: "9px",
                              fontWeight: 700,
                              letterSpacing: "1px",
                              textTransform: "uppercase",
                              color: borderColor,
                              background: `${borderColor}14`,
                              border: `1px solid ${borderColor}30`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}>
                              {isCreate ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              ) : (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                              )}
                              {isCreate ? "REPORT CREATED" : "REPORT DELETED"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 20px" }}>
                            {relatedId ? (
                              <button
                                onClick={() => router.push(`/dashboard/audit-trails/${relatedId}`)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "#7c3aed", padding: 0, textDecoration: "underline", textDecorationColor: "rgba(124,58,237,0.3)" }}
                              >
                                {relatedId.slice(0, 12)}…
                              </button>
                            ) : (
                              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.2)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 20px", fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.4)" }}>
                            {(r.metadata as Record<string, unknown>)?.actor as string || r.ip_address || "—"}
                          </td>
                          <td style={{ padding: "12px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.3)", whiteSpace: "nowrap" }}>
                            {fmtShort(r.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>{/* end page container */}

      {/* Detail drawer — dark theme */}
      {selected && (() => {
        const m = getMeta(selected);
        const vs = m.verdict ? VERDICT_STYLE[m.verdict] : null;
        return (
          <>
            {/* Overlay */}
            <div
              onClick={() => setSelected(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.6)", backdropFilter: "blur(4px)", zIndex: 200 }}
            />
            {/* Drawer panel */}
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "420px", background: "#0b0d1c", borderLeft: "1px solid rgba(255,255,255,0.07)", zIndex: 201, display: "flex", flexDirection: "column", overflowY: "auto" }}>
              {/* Drawer header */}
              <div style={{ padding: "24px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "18px", color: "#f0f2ff", marginBottom: "4px" }}>Audit Detail</h3>
                  <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.3)", letterSpacing: "0.5px" }}>{selected.id.slice(0, 24)}…</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "rgba(240,242,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(244,63,94,0.1)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {/* Drawer body */}
              <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Core details card */}
                <div style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { key: "Action", value: <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: "rgba(124,58,237,0.12)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}>{selected.action_type.replace(/_/g, " ")}</span> },
                    m.requestId ? { key: "Request ID", value: <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "#7c3aed", wordBreak: "break-all" }}>{m.requestId}</code> } : null,
                    (vs && m.verdict) ? { key: "Verdict", value: <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color }}>{m.verdict}</span> } : null,
                    m.overallScore != null ? { key: "Trust Score", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: "14px", color: m.overallScore >= 0.85 ? "#10b981" : m.overallScore >= 0.6 ? "#f59e0b" : "#f43f5e" }}>{(m.overallScore * 100).toFixed(1)}%</span> } : null,
                    m.totalLatencyMs != null ? { key: "Latency", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "rgba(240,242,255,0.7)" }}>{m.totalLatencyMs}ms</span> } : null,
                    m.sdkVersion ? { key: "SDK Version", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.5)" }}>{m.sdkVersion}</span> } : null,
                    { key: "Timestamp", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.5)" }}>{fmtTs(selected.created_at)}</span> },
                    { key: "IP Address", value: <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.5)" }}>{selected.ip_address || "—"}</span> },
                  ].filter(Boolean).map((row) => row && (
                    <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", flexShrink: 0 }}>{row.key}</span>
                      <span>{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Pillar scores */}
                {m.pillarScores && Object.keys(m.pillarScores).length > 0 && (
                  <div style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px" }}>
                    <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "16px" }}>Pillar Scores</h4>
                    {Object.entries(m.pillarScores).map(([pillar, score]) => {
                      const pct = score * 100;
                      const color = pct >= 85 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#f43f5e";
                      return (
                        <div key={pillar} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "1px", textTransform: "capitalize", color: "rgba(240,242,255,0.4)", minWidth: "110px" }}>{pillar.replace(/_/g, " ")}</span>
                          <div style={{ flex: 1, height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
                          </div>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", fontWeight: 600, color, minWidth: "40px", textAlign: "right" }}>{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Critical flags */}
                {m.criticalFlags.length > 0 && (
                  <div style={{ padding: "14px 16px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "12px" }}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#f43f5e", marginBottom: "8px" }}>Critical Flags</div>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(244,63,94,0.8)", lineHeight: 1.6 }}>
                      {m.criticalFlags.join(" · ")}
                    </div>
                  </div>
                )}

                {/* PDF button */}
                {selected.action_type === "trust_evaluation" && m.requestId && (
                  <button
                    disabled={generatingPdf === m.requestId || pdfDone.has(m.requestId)}
                    onClick={(e) => generatePdf(selected, e)}
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", background: "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "opacity 0.2s", opacity: (generatingPdf === m.requestId) ? 0.6 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {generatingPdf === m.requestId ? "Generating PDF…" : pdfDone.has(m.requestId) ? "✓ Report Ready" : "Generate PDF Report"}
                  </button>
                )}

                {/* Raw metadata */}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px" }}>
                    <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", marginBottom: "12px" }}>Raw Metadata</h4>
                    <pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.5)", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.7 }}>
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* Toast notifications */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", display: "flex", flexDirection: "column", gap: "8px", zIndex: 300 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ padding: "12px 16px", borderRadius: "12px", fontFamily: "DM Sans, sans-serif", fontSize: "13px", fontWeight: 500, color: "#f0f2ff", background: t.type === "error" ? "rgba(244,63,94,0.9)" : "rgba(16,185,129,0.9)", backdropFilter: "blur(12px)", border: `1px solid ${t.type === "error" ? "rgba(244,63,94,0.5)" : "rgba(16,185,129,0.5)"}`, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "telRowIn 0.3s ease both" }}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
