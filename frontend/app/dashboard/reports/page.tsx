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

function fmtBytes(b?: number | null): string {
  if (!b) return "N/A";
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

function mapStatus(s: string): "complete" | "processing" | "failed" {
  if (s === "completed") return "complete";
  if (s === "generating") return "processing";
  return "failed";
}

const CIRC = 175.93; // 2π × 28

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalEvaluations, setTotalEvaluations] = useState<number | null>(null);
  const [avgTrustScore, setAvgTrustScore] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reports");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load reports");
      setReports(Array.isArray(payload) ? payload : []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load reports", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
    fetch("/api/analytics?path=summary&range=30d")
      .then((r) => r.json())
      .then((data) => setTotalEvaluations(data.total_evaluations ?? null))
      .catch(() => {});
    fetch("/api/analytics?path=sdk-stats&range=30d")
      .then((r) => r.json())
      .then((data) => {
        const score = data.avg_trust_score;
        setAvgTrustScore(score != null ? Math.round(score) : null);
      })
      .catch(() => {});
  }, [loadReports]);

  // Click-outside dismisses delete confirmation
  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-confirm="${confirmDeleteId}"]`)) {
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmDeleteId]);

  async function handleDownloadPdf(report: Report) {
    try {
      const res = await fetch(`/api/reports/${report.id}?download=1`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(payload.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VeldrixAI_${(report.report_name || "Report").replace(/ /g, "_")}_${report.vx_report_id || report.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`${report.report_name || "Report"} downloading…`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Download failed", "error");
    }
  }

  async function handleDeleteReport(reportId: string) {
    setDeletingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Delete failed");
      const name = reports.find((r) => r.id === reportId)?.report_name;
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      showToast(`${name || "Report"} deleted`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <>
      <div style={{ padding: "48px", minHeight: "100%", background: "#050810" }}>
        {/* Hero */}
        <section
          className="section-reveal"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "48px",
            marginBottom: "48px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: "680px" }}>
            <h2
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(32px, 4vw, 52px)",
                letterSpacing: "-2px",
                color: "#f0f2ff",
                marginBottom: "16px",
                lineHeight: 1.05,
              }}
            >
              Trust Reports
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 300,
                  fontSize: "28px",
                  letterSpacing: "-0.5px",
                  color: "rgba(240,242,255,0.3)",
                  marginLeft: "12px",
                }}
              >
                (Operations)
              </span>
            </h2>
            <p
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 300,
                fontSize: "17px",
                color: "rgba(240,242,255,0.5)",
                lineHeight: 1.7,
              }}
            >
              Governance intelligence reports generated from high-fidelity AI evaluations. Review
              real-time risk assessments, ethical alignment metrics, and compliance logs across the
              enterprise stack.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                className="live-dot"
                style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}
              />
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "#10b981",
                }}
              >
                System Status: Optimal
              </span>
            </div>

            <div
              className="glass-panel"
              style={{
                display: "flex",
                alignItems: "center",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div className="hero-stat-reveal hs-1" style={{ padding: "16px 24px", textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "rgba(240,242,255,0.3)",
                    marginBottom: "4px",
                  }}
                >
                  Total Evaluations
                </div>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    fontSize: "22px",
                    color: "#7c3aed",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {totalEvaluations !== null ? totalEvaluations.toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ width: "1px", height: "40px", background: "rgba(255,255,255,0.07)" }} />

              <div className="hero-stat-reveal hs-2" style={{ padding: "16px 24px", textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "rgba(240,242,255,0.3)",
                    marginBottom: "4px",
                  }}
                >
                  Avg Trust Score
                </div>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    fontSize: "22px",
                    color: "#10b981",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {avgTrustScore !== null ? `${avgTrustScore}%` : "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cards */}
        {isLoading ? (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "20px" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-card"
                style={{ borderRadius: "20px", height: "280px", border: "1px solid rgba(255,255,255,0.04)" }}
              />
            ))}
          </section>
        ) : reports.length === 0 ? (
          <div
            className="glass-panel"
            style={{
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "64px 32px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: "18px",
                color: "#f0f2ff",
                marginBottom: "12px",
              }}
            >
              No reports generated yet
            </p>
            <p
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 300,
                fontSize: "14px",
                color: "rgba(240,242,255,0.4)",
                marginBottom: "24px",
              }}
            >
              Open Audit Logs and click Generate PDF on any request to create a report.
            </p>
            <Link
              href="/dashboard/audit-trails"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "100px",
                textDecoration: "none",
                background: "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)",
                color: "white",
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              Open Audit Logs →
            </Link>
          </div>
        ) : (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "20px" }}>
            {reports.map((report, i) => {
              const status = mapStatus(report.status);
              const score = report.overall_score ?? null;
              const ringOffset = (CIRC * (1 - (score ?? 0) / 100)).toFixed(1);
              const ringColor =
                score == null
                  ? "rgba(255,255,255,0.15)"
                  : score >= 80
                  ? "#10b981"
                  : score >= 60
                  ? "#f59e0b"
                  : "#f43f5e";
              const cardIdx = Math.min(i + 1, 8);
              const canDownload = report.status === "completed";

              return (
                <div
                  key={report.id}
                  className={`report-card rc-${cardIdx} glass-panel`}
                  style={{
                    borderRadius: "20px",
                    padding: "24px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                    position: "relative",
                    overflow: "hidden",
                    transition: "border-color 0.3s, box-shadow 0.3s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(124,58,237,0.25)";
                    e.currentTarget.style.boxShadow = "0 8px 40px rgba(124,58,237,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Ambient orb */}
                  <div
                    className="card-orb"
                    style={{ background: `radial-gradient(circle, ${ringColor}33 0%, transparent 70%)` }}
                  />

                  {/* Score ring + status badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ position: "relative", width: "64px", height: "64px" }}>
                      <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="32" cy="32" r="28" fill="transparent" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          fill="transparent"
                          stroke={ringColor}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray="175.9"
                          className={`ring-fill rf-${cardIdx}`}
                          style={{ "--ring-offset": ringOffset } as React.CSSProperties}
                        />
                      </svg>
                      <div
                        className="score-count-reveal"
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "Syne, sans-serif",
                            fontWeight: 800,
                            fontSize: "14px",
                            color: "#f0f2ff",
                          }}
                        >
                          {score != null ? score.toFixed(0) : "—"}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                        background:
                          status === "complete"
                            ? "rgba(16,185,129,0.1)"
                            : status === "processing"
                            ? "rgba(124,58,237,0.1)"
                            : "rgba(244,63,94,0.1)",
                        color:
                          status === "complete" ? "#10b981" : status === "processing" ? "#7c3aed" : "#f43f5e",
                        border: `1px solid ${
                          status === "complete"
                            ? "rgba(16,185,129,0.2)"
                            : status === "processing"
                            ? "rgba(124,58,237,0.2)"
                            : "rgba(244,63,94,0.2)"
                        }`,
                      }}
                    >
                      {status === "complete" ? "Complete" : status === "processing" ? "Processing" : "Failed"}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div>
                    <h3
                      style={{
                        fontFamily: "Syne, sans-serif",
                        fontWeight: 700,
                        fontSize: "16px",
                        color: "#f0f2ff",
                        marginBottom: "6px",
                        transition: "color 0.2s",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#a78bfa")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#f0f2ff")}
                    >
                      {report.report_name || report.title || `${(report.report_type || "report").replace(/_/g, " ")} · ${report.id.slice(0, 8)}`}
                    </h3>
                    {report.vx_report_id && (
                      <p
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "11px",
                          color: "rgba(240,242,255,0.3)",
                          marginBottom: "6px",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {report.vx_report_id}
                      </p>
                    )}
                    <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.4)" }}>
                      {report.report_type.replace(/_/g, " ")}
                    </p>
                  </div>

                  {/* File info */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: "16px",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: "10px",
                        fontWeight: 500,
                        color: "rgba(240,242,255,0.3)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      {fmtBytes(report.output_full_report?.file_size_bytes)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: "10px",
                        fontWeight: 500,
                        color: "rgba(240,242,255,0.3)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {new Date(report.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button
                      onClick={() => handleDownloadPdf(report)}
                      disabled={!canDownload}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "10px",
                        borderRadius: "10px",
                        cursor: canDownload ? "pointer" : "not-allowed",
                        background: canDownload ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                        color: canDownload ? "#7c3aed" : "rgba(240,242,255,0.2)",
                        fontFamily: "Syne, sans-serif",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                        border: `1px solid ${canDownload ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.04)"}`,
                      }}
                      onMouseEnter={(e) => {
                        if (canDownload) e.currentTarget.style.background = "rgba(124,58,237,0.25)";
                      }}
                      onMouseLeave={(e) => {
                        if (canDownload) e.currentTarget.style.background = "rgba(124,58,237,0.15)";
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      PDF
                    </button>

                    {confirmDeleteId === report.id ? (
                      <button
                        data-confirm={report.id}
                        onClick={() => handleDeleteReport(report.id)}
                        className="delete-shake"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "10px",
                          borderRadius: "10px",
                          border: "1px solid rgba(244,63,94,0.4)",
                          background: "rgba(244,63,94,0.15)",
                          color: "#f43f5e",
                          fontFamily: "Syne, sans-serif",
                          fontWeight: 700,
                          fontSize: "10px",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                        }}
                      >
                        {deletingId === report.id ? (
                          <svg
                            className="eval-spinner"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Confirm
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(report.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          padding: "10px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.05)",
                          background: "transparent",
                          color: "rgba(240,242,255,0.3)",
                          fontFamily: "Syne, sans-serif",
                          fontWeight: 700,
                          fontSize: "11px",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#f43f5e";
                          e.currentTarget.style.borderColor = "rgba(244,63,94,0.25)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "rgba(240,242,255,0.3)";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {/* Toast notifications */}
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 2000,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.type === "success" ? "#10b981" : "#f43f5e",
              color: "white",
              padding: "12px 18px",
              borderRadius: "10px",
              fontFamily: "DM Sans, sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              maxWidth: "360px",
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}
