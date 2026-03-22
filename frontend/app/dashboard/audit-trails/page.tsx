"use client";

import { useState, useEffect, useCallback } from "react";

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

  function showToast(message: string, type = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  const load = useCallback(async () => {
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
    }
  }, [page, actionType, search]);

  useEffect(() => { load(); }, [load]);

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
          setData((prev) => prev ? { ...prev, total: prev.total + 1, records: [newRow, ...prev.records.slice(0, prev.limit - 1)] } : prev);
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

    // SSE rows have flat fields; DB rows nest under .result
    const requestId = (m.request_id as string) || (result.request_id as string) || null;

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
      <div className="vx-content">
      <div className="vx-page-header">
        <div>
          <h1 className="vx-page-title">Audit Logs</h1>
          <p className="vx-page-desc">Complete action history and SDK trust evaluation log</p>
        </div>
        <button className="vx-btn vx-btn-primary" onClick={exportCSV}>Export CSV</button>
      </div>

      <div className="vx-filter-bar">
        <div className="vx-search-input">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search action type..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="vx-filter-item">
          <label>Action</label>
          <select value={actionType} onChange={(e) => { setActionType(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="vx-error">{error}</div>}

      <div className="vx-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="vx-table vx-table-clickable">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Action</th>
                <th>Verdict</th>
                <th>Trust Score</th>
                <th>Latency</th>
                <th>Timestamp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--vx-text-muted)" }}>Loading...</td></tr>
              ) : !data || data.records.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--vx-text-muted)" }}>
                  No audit records yet. SDK analysis calls and actions will appear here automatically.
                </td></tr>
              ) : (
                data.records.map((r) => {
                  const m = getMeta(r);
                  const isSdk = r.action_type === "trust_evaluation";
                  const vs = m.verdict ? VERDICT_STYLE[m.verdict] : null;
                  const reqId = m.requestId || r.id;
                  const done = pdfDone.has(reqId);

                  return (
                    <tr key={r.id} onClick={() => setSelected(r)}>
                      <td>
                        {m.requestId ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            <code style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--vx-violet)" }} title={m.requestId}>
                              {m.requestId.slice(0, 8)}
                            </code>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(m.requestId!); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vx-text-muted)", padding: "2px", fontSize: "0.7rem" }}
                              title="Copy full request ID"
                            >⧉</button>
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "var(--vx-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td><span className="vx-badge vx-badge-accent">{r.action_type}</span></td>
                      <td>
                        {vs && m.verdict ? (
                          <span style={{
                            display: "inline-flex", padding: "0.2rem 0.6rem", borderRadius: "50px",
                            fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em",
                            background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color,
                          }}>{m.verdict}</span>
                        ) : <span style={{ color: "var(--vx-text-muted)", fontSize: "0.82rem" }}>—</span>}
                      </td>
                      <td>
                        {m.overallScore != null ? (
                          <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "0.85rem", color: m.overallScore >= 0.85 ? "var(--vx-emerald)" : m.overallScore >= 0.6 ? "var(--vx-amber)" : "var(--vx-rose)" }}>
                            {(m.overallScore * 100).toFixed(1)}%
                          </span>
                        ) : <span style={{ color: "var(--vx-text-muted)", fontSize: "0.82rem" }}>—</span>}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--vx-text-muted)" }}>
                        {m.totalLatencyMs != null ? `${m.totalLatencyMs}ms` : "—"}
                      </td>
                      <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{fmtShort(r.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          {isSdk && (
                            <button
                              onClick={(e) => generatePdf(r, e)}
                              disabled={generatingPdf === reqId || done}
                              style={{
                                padding: "4px 14px", borderRadius: 8,
                                border: done ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(124,58,237,0.35)",
                                background: "transparent",
                                color: done ? "#10b981" : "rgba(167,139,250,0.85)",
                                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
                                letterSpacing: "0.08em",
                                cursor: (generatingPdf === reqId || done) ? "default" : "pointer",
                                opacity: generatingPdf === reqId ? 0.5 : 1,
                                transition: "all 0.2s", whiteSpace: "nowrap",
                              }}
                            >
                              {generatingPdf === reqId ? "Generating…" : done ? "Report Ready" : "Generate PDF"}
                            </button>
                          )}
                          <button className="vx-btn vx-btn-ghost vx-btn-sm" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>View</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="vx-pagination" style={{ padding: "0.85rem 1rem" }}>
            <span className="vx-pagination-info">
              {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
            </span>
            <div className="vx-pagination-controls">
              <button className="vx-pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`vx-pagination-btn ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="vx-pagination-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
      </div>{/* end vx-content */}

      {/* Detail drawer */}
      {selected && (() => {
        const m = getMeta(selected);
        const vs = m.verdict ? VERDICT_STYLE[m.verdict] : null;
        return (
          <>
            <div className="vx-drawer-overlay" onClick={() => setSelected(null)} />
            <div className="vx-drawer">
              <div className="vx-drawer-header">
                <div>
                  <h3 className="vx-modal-title">Audit Detail</h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--vx-text-muted)", marginTop: "0.2rem" }}>{selected.id}</p>
                </div>
                <button className="vx-modal-close" onClick={() => setSelected(null)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="vx-drawer-body">
                <div className="vx-card">
                  <div className="vx-detail-row"><span className="vx-detail-key">Action</span><span className="vx-badge vx-badge-accent">{selected.action_type}</span></div>
                  {m.requestId && (
                    <div className="vx-detail-row">
                      <span className="vx-detail-key">Request ID</span>
                      <span className="vx-detail-value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{m.requestId}</span>
                    </div>
                  )}
                  {vs && m.verdict && (
                    <div className="vx-detail-row">
                      <span className="vx-detail-key">Verdict</span>
                      <span style={{ padding: "0.2rem 0.6rem", borderRadius: "50px", fontSize: "0.7rem", fontWeight: 600, background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color }}>{m.verdict}</span>
                    </div>
                  )}
                  {m.overallScore != null && (
                    <div className="vx-detail-row">
                      <span className="vx-detail-key">Trust Score</span>
                      <span className="vx-detail-value" style={{ fontWeight: 700, color: m.overallScore >= 0.85 ? "var(--vx-emerald)" : m.overallScore >= 0.6 ? "var(--vx-amber)" : "var(--vx-rose)" }}>
                        {(m.overallScore * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {m.totalLatencyMs != null && (
                    <div className="vx-detail-row"><span className="vx-detail-key">Latency</span><span className="vx-detail-value">{m.totalLatencyMs}ms</span></div>
                  )}
                  {m.sdkVersion && (
                    <div className="vx-detail-row"><span className="vx-detail-key">SDK Version</span><span className="vx-detail-value">{m.sdkVersion}</span></div>
                  )}
                  <div className="vx-detail-row"><span className="vx-detail-key">Timestamp</span><span className="vx-detail-value">{fmtTs(selected.created_at)}</span></div>
                  <div className="vx-detail-row"><span className="vx-detail-key">IP Address</span><span className="vx-detail-value">{selected.ip_address || "—"}</span></div>
                </div>

                {/* Pillar scores */}
                {m.pillarScores && Object.keys(m.pillarScores).length > 0 && (
                  <div className="vx-card" style={{ marginTop: "1rem" }}>
                    <h4 style={{ fontSize: "0.85rem", fontWeight: 650, marginBottom: "0.75rem", fontFamily: "var(--vx-font-display)" }}>Pillar Scores</h4>
                    {Object.entries(m.pillarScores).map(([pillar, score]) => {
                      const pct = score * 100;
                      const color = pct >= 85 ? "var(--vx-emerald)" : pct >= 60 ? "var(--vx-amber)" : "var(--vx-rose)";
                      return (
                        <div key={pillar} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.82rem", color: "var(--vx-text-muted)", minWidth: "110px", textTransform: "capitalize" }}>{pillar.replace("_", " ")}</span>
                          <div style={{ flex: 1, height: 6, background: "rgba(124,58,237,0.10)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color, minWidth: "45px", textAlign: "right" }}>{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Critical flags */}
                {m.criticalFlags.length > 0 && (
                  <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "8px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--vx-rose)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Critical Flags</span>
                    <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: "var(--vx-rose)" }}>
                      {m.criticalFlags.join(" · ")}
                    </div>
                  </div>
                )}

                {/* Generate PDF button in drawer */}
                {selected.action_type === "trust_evaluation" && m.requestId && (
                  <div style={{ marginTop: "1rem" }}>
                    <button
                      className="vx-btn vx-btn-primary"
                      style={{ width: "100%" }}
                      disabled={generatingPdf === m.requestId || pdfDone.has(m.requestId)}
                      onClick={(e) => generatePdf(selected, e)}
                    >
                      {generatingPdf === m.requestId ? "Generating PDF…" : pdfDone.has(m.requestId) ? "✓ Report Ready" : "Generate PDF Report"}
                    </button>
                  </div>
                )}

                {/* Raw metadata */}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div className="vx-card" style={{ marginTop: "1rem" }}>
                    <h4 style={{ fontSize: "0.85rem", fontWeight: 650, marginBottom: "0.75rem" }}>Raw Metadata</h4>
                    <pre style={{ fontSize: "0.8rem", color: "var(--vx-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      <div className="vx-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`vx-toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
