"use client";

import { useState } from "react";

const VERDICT_COLORS: Record<string, string> = {
  ALLOW:      "#10B981",
  WARN:       "#f59e0b",
  REVIEW:     "#06B6D4",
  BLOCK:      "#F43F5E",
  REWRITE:    "#7C3AED",
  MASK:       "#4F46E5",
  DISCLAIMER: "#06B6D4",
  ESCALATE:   "#f59e0b",
  REGENERATE: "#4F46E5",
};

function fmtTs(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function fmtRelative(ts: string | null): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  requestId:      string | null;
  createdAt:      string | null;
  verdict:        string | null;
  totalLatencyMs: number | null;
  perPillarMs:    Record<string, number>;
  orgP95Ms?:      number;
  provider?:      string;
  budgetTier?:    string;
}

export default function EvaluationHeader({
  requestId,
  createdAt,
  verdict,
  totalLatencyMs,
  perPillarMs,
  orgP95Ms,
  provider,
  budgetTier,
}: Props) {
  const [copied, setCopied] = useState(false);

  const verdictColor = verdict ? VERDICT_COLORS[verdict] ?? "#06B6D4" : "#06B6D4";

  function handleCopy() {
    if (!requestId) return;
    navigator.clipboard.writeText(requestId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // Latency microbar: this eval vs p95
  const latencyPct = orgP95Ms && totalLatencyMs
    ? Math.min(100, Math.round((totalLatencyMs / orgP95Ms) * 100))
    : null;
  const latencyColor =
    totalLatencyMs == null
      ? "#06B6D4"
      : totalLatencyMs < 300
      ? "#10B981"
      : totalLatencyMs < 600
      ? "#f59e0b"
      : "#F43F5E";

  return (
    <div
      style={{
        height: 64,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            24,
        padding:        "0 28px",
        background:     "rgba(255,255,255,0.015)",
        border:         "1px solid rgba(255,255,255,0.06)",
        borderRadius:   16,
        flexWrap:       "wrap",
        marginBottom:   20,
        flexShrink:     0,
      }}
    >
      {/* Request ID */}
      <button
        onClick={handleCopy}
        title="Click to copy"
        style={{
          background:    "none",
          border:        "none",
          cursor:        "pointer",
          padding:       0,
          display:       "flex",
          alignItems:    "center",
          gap:           8,
          fontFamily:    "JetBrains Mono, monospace",
          fontSize:      13,
          color:         copied ? "#06B6D4" : "rgba(240,242,255,0.75)",
          transition:    "color 0.2s",
          letterSpacing: "0.5px",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        {requestId ? `REQ-${requestId.slice(0, 12).toUpperCase()}` : "—"}
        {copied && (
          <span style={{ fontSize: 10, color: "#06B6D4", letterSpacing: "1px" }}>COPIED</span>
        )}
      </button>

      {/* Timestamp */}
      <div
        title={fmtTs(createdAt)}
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize:   12,
          color:      "rgba(240,242,255,0.4)",
          cursor:     "default",
        }}
      >
        {fmtRelative(createdAt)}
      </div>

      {/* Verdict pill */}
      {verdict && (
        <div
          style={{
            padding:    "4px 14px",
            background: `${verdictColor}18`,
            border:     `1px solid ${verdictColor}50`,
            borderRadius: 20,
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize:   11,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color:      verdictColor,
          }}
        >
          {verdict}
        </div>
      )}

      {/* Latency microbar */}
      {totalLatencyMs != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Total latency bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 80,
                  height: 4,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${latencyPct ?? 50}%`,
                    height: "100%",
                    background: latencyColor,
                    borderRadius: 2,
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize:   11,
                  color:      latencyColor,
                  minWidth:   48,
                }}
              >
                {totalLatencyMs}ms
              </span>
            </div>
            {orgP95Ms && (
              <div
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize:   9,
                  color:      "rgba(240,242,255,0.2)",
                  letterSpacing: "0.5px",
                }}
              >
                p95 = {orgP95Ms}ms
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provider + tier badge */}
      {(provider || budgetTier) && (
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize:   10,
            color:      "rgba(240,242,255,0.3)",
            background: "rgba(255,255,255,0.03)",
            border:     "1px solid rgba(255,255,255,0.06)",
            borderRadius: 6,
            padding:    "3px 8px",
            letterSpacing: "0.5px",
          }}
        >
          {provider ?? "multi-provider"} · {budgetTier ?? "STANDARD"}
        </div>
      )}
    </div>
  );
}
