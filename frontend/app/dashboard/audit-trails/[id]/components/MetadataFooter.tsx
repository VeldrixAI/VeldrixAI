"use client";

import { useState } from "react";

interface Props {
  id:           string;
  requestId:    string | null;
  createdAt:    string | null;
  actor:        string | null;
  ipAddress:    string | null;
  logType:      string;
  entityType:   string | null;
  sdkVersion?:  string;
  budgetTier?:  string;
  metadata:     Record<string, unknown>;
}

function fmtTs(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 23) + " UTC";
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 9,
        letterSpacing: "2px", textTransform: "uppercase",
        color: "rgba(240,242,255,0.25)", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? "JetBrains Mono, monospace" : "DM Sans, sans-serif",
        fontSize: 12, color: "rgba(240,242,255,0.55)",
        wordBreak: "break-all",
      }}>
        {value}
      </div>
    </div>
  );
}

export default function MetadataFooter({
  id, requestId, createdAt, actor, ipAddress,
  logType, entityType, sdkVersion, budgetTier, metadata,
}: Props) {
  const [open, setOpen] = useState(false);

  const policyVersionHash = (metadata.policy_version as string | undefined) ?? "—";
  const keyFingerprint = (metadata.api_key_fingerprint as string | undefined)
    ?? (typeof actor === "string" && actor.length > 4 ? `…${actor.slice(-4)}` : "—");

  async function handleDownload() {
    const bundle = {
      request_id:    requestId ?? id,
      recorded_at:   createdAt,
      actor,
      ip_address:    ipAddress,
      log_type:      logType,
      entity_type:   entityType,
      sdk_version:   sdkVersion,
      budget_tier:   budgetTier,
      metadata,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `veldrix-evidence-${(requestId ?? id).slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        background:   "rgba(255,255,255,0.015)",
        border:       "1px solid rgba(255,255,255,0.05)",
        borderRadius: 14,
        overflow:     "hidden",
      }}
    >
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:      "100%",
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding:    "14px 20px",
          background: "none",
          border:     "none",
          cursor:     "pointer",
          color:      "rgba(240,242,255,0.35)",
        }}
      >
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, letterSpacing: "3px", textTransform: "uppercase" }}>
          Request Metadata
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
            <MetaRow label="Request ID"    value={requestId ?? id} mono />
            <MetaRow label="Record ID"     value={id}              mono />
            <MetaRow label="Log Type"      value={logType}               />
            <MetaRow label="Entity Type"   value={entityType ?? "—"}     />
            <MetaRow label="Timestamp"     value={fmtTs(createdAt)} mono />
            <MetaRow label="Actor"         value={actor ?? "—"}          />
            <MetaRow label="IP Address"    value={ipAddress ?? "—"} mono />
            <MetaRow label="SDK Version"   value={sdkVersion ?? "—"} mono />
            <MetaRow label="Budget Tier"   value={budgetTier ?? "—"} mono />
            <MetaRow label="Policy Hash"   value={policyVersionHash} mono />
            <MetaRow label="Key Fingerprint" value={keyFingerprint}  mono />
          </div>

          <button
            onClick={handleDownload}
            style={{
              padding:    "8px 16px",
              background: "rgba(124,58,237,0.08)",
              border:     "1px solid rgba(124,58,237,0.2)",
              borderRadius: 8,
              color:      "rgba(124,58,237,0.7)",
              fontFamily: "DM Sans, sans-serif",
              fontSize:   12,
              fontWeight: 600,
              cursor:     "pointer",
              display:    "flex",
              alignItems: "center",
              gap:        6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download evidence bundle (.json)
          </button>
        </div>
      )}
    </div>
  );
}
