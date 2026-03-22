"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Report = {
  id: string;
  report_name: string | null;
  vx_report_id: string | null;
  title: string | null;
  report_type: string;
  status: string;
  storage_path: string | null;
  overall_score?: number | null;
  output_full_report?: { file_size_bytes?: number } | null;
  version: number;
  created_at: string;
};

function scoreColor(s?: number | null) {
  if (s == null) return "var(--vx-text-dim)";
  return s >= 85 ? "#10b981" : s >= 70 ? "#f59e0b" : "#f43f5e";
}

function scoreLabel(s?: number | null) {
  if (s == null) return "—";
  return s >= 85 ? "TRUSTED" : s >= 70 ? "CAUTION" : "AT RISK";
}

function ScoreRing({ score }: { score?: number | null }) {
  const r = 22, cx = 28, cy = 28, sw = 4;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) / 100 : 0;
  const color = scoreColor(score);
  return (
    <svg width={56} height={56} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(124,58,237,0.12)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.4s ease" }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize="9" fontWeight="700" fill={color} fontFamily="monospace">
        {score != null ? score.toFixed(0) : "—"}
      </text>
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    completed:  { cls: "vx-badge-success", label: "COMPLETE" },
    failed:     { cls: "vx-badge-error",   label: "FAILED" },
    generating: { cls: "vx-badge-warning", label: "PENDING" },
  };
  const { cls, label } = cfg[status] ?? { cls: "vx-badge-accent", label: status.toUpperCase() };
  return <span className={`vx-badge ${cls}`}>{label}</span>;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtBytes(b?: number | null) {
  if (!b) return null;
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export default function ReportsPage() {
  const [reports, setReports]   = useState<Report[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toasts, setToasts]     = useState<{ id: number; msg: string; type: string }[]>([]);

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reports");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load reports");
      setReports(Array.isArray(payload) ? payload : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteReport(id: string, name: string | null) {
    if (!confirm(`Delete "${name || "this report"}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Delete failed");
      setReports((prev) => prev.filter((r) => r.id !== id));
      showToast(`${name || "Report"} deleted`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeleting(null);
    }
  }

  async function downloadReport(id: string, name: string | null, vxId: string | null) {
    try {
      const res = await fetch(`/api/reports/${id}?download=1`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Download failed");
      if (payload.signed_url) {
        const a = document.createElement("a");
        a.href = payload.signed_url;
        a.download = `VeldrixAI_${(name || "Report").replace(/ /g, "_")}_${vxId || id.slice(0, 8)}.pdf`;
        a.target = "_blank";
        a.click();
        showToast(`${name || "Report"} downloading…`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Download failed", "error");
    }
  }

  return (
    <>
      <div className="vx-content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <h1 className="vx-page-title">Trust Reports</h1>
            <p className="vx-page-desc">Governance intelligence reports generated from your AI evaluations</p>
          </div>
          <Link href="/dashboard/evaluate" className="vx-btn vx-btn-primary">+ New Evaluation</Link>
        </div>

        {error && <div className="vx-error">{error}</div>}

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="vx-card" style={{ height: 210, opacity: 0.2 }} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="vx-card" style={{ textAlign: "center", padding: "4.5rem 2rem" }}>
            <svg width="60" height="60" viewBox="0 0 100 100" style={{ margin: "0 auto 1.5rem", display: "block" }}>
              <defs>
                <linearGradient id="vGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7C3AED" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path d="M24 30 L50 70 L76 30" stroke="url(#vGrad2)" strokeWidth="7" strokeLinecap="round" fill="none" />
              <circle cx="50" cy="70" r="5" fill="#06B6D4" />
              <circle cx="50" cy="70" r="2.5" fill="#ffffff" />
            </svg>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "var(--vx-font-display)", color: "var(--vx-text-primary)", marginBottom: "0.5rem" }}>
              No reports generated yet
            </p>
            <p style={{ fontSize: "0.9rem", color: "var(--vx-text-muted)", marginBottom: "1.75rem", maxWidth: 420, margin: "0 auto 1.75rem", fontWeight: 300, lineHeight: 1.6 }}>
              Open Audit Logs and click Generate PDF on any request to create a report.
            </p>
            <Link href="/dashboard/audit-trails" className="vx-btn vx-btn-primary">
              Open Audit Logs →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
            {reports.map((r) => {
              const fileSize   = fmtBytes(r.output_full_report?.file_size_bytes);
              const canDownload = r.status === "completed" && r.storage_path;
              return (
                <div key={r.id} className="vx-card" style={{
                  display: "flex", flexDirection: "column", gap: "0.9rem",
                  padding: "1.35rem", position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem" }}>
                    <ScoreRing score={r.overall_score} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "1rem", fontWeight: 700, fontFamily: "var(--vx-font-display)", lineHeight: 1.25,
                        color: "var(--vx-text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: "0.3rem",
                      }}>
                        {r.report_name || "Unnamed Report"}
                      </div>
                      {r.vx_report_id && (
                        <code style={{
                          fontSize: "0.68rem", color: "var(--vx-violet)",
                          background: "var(--vx-violet-lt)", border: "1px solid rgba(124,58,237,0.15)",
                          borderRadius: 4, padding: "1px 6px", fontFamily: "var(--vx-font-mono)",
                          letterSpacing: "0.02em",
                        }}>
                          {r.vx_report_id}
                        </code>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {r.title && (
                    <div style={{
                      fontSize: "12px", color: "var(--vx-text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontStyle: "italic",
                    }}>
                      {r.title}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span className="vx-badge vx-badge-violet">
                      {r.report_type.replace(/_/g, " ")}
                    </span>
                    <span className="vx-cell-mono">v{r.version}</span>
                    {fileSize && <span className="vx-cell-mono">{fileSize}</span>}
                    <span className="vx-cell-mono" style={{ marginLeft: "auto" }}>
                      {fmt(r.created_at)}
                    </span>
                  </div>

                  <div style={{
                    display: "flex", gap: "0.5rem",
                    paddingTop: "0.75rem", borderTop: "1px solid var(--vx-divider)",
                    marginTop: "auto",
                  }}>
                    {canDownload ? (
                      <button className="vx-btn vx-btn-primary vx-btn-sm" style={{ flex: 1 }}
                        onClick={() => downloadReport(r.id, r.report_name, r.vx_report_id)}>
                        Download PDF ↓
                      </button>
                    ) : (
                      <div style={{ flex: 1 }} />
                    )}
                    <button
                      className="vx-btn vx-btn-danger vx-btn-sm"
                      disabled={deleting === r.id}
                      onClick={() => deleteReport(r.id, r.report_name)}
                    >
                      {deleting === r.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem", zIndex: 2000 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: t.type === "success" ? "var(--vx-emerald)" : "var(--vx-rose)",
            color: "white",
            padding: "0.75rem 1.15rem",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
            animation: "vx-toast-in 0.3s ease",
            maxWidth: "360px",
          }}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
