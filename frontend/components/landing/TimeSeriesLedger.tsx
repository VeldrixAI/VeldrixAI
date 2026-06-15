"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditEntry {
  id: string;
  timestamp: string;
  pillar: string;
  action: "allow" | "flag" | "block" | "mask";
  latency: number;
  policy: string;
  sha256: string;
}

const AUDIT_ENTRIES: AuditEntry[] = [
  { id: "evt_8f2a91c4", timestamp: "2026-05-13T14:23:41Z", pillar: "compliance_pii", action: "mask", latency: 247, policy: "v2.3.1", sha256: "4a7f" },
  { id: "evt_3c1b77d2", timestamp: "2026-05-13T14:23:43Z", pillar: "safety_toxicity", action: "allow", latency: 189, policy: "v2.3.1", sha256: "8c3e" },
  { id: "evt_a9e40c81", timestamp: "2026-05-13T14:23:45Z", pillar: "hallucination", action: "flag", latency: 312, policy: "v2.3.1", sha256: "1f92" },
  { id: "evt_5d82fb19", timestamp: "2026-05-13T14:23:47Z", pillar: "prompt_security", action: "block", latency: 98, policy: "v2.3.1", sha256: "7b4d" },
  { id: "evt_c7340af3", timestamp: "2026-05-13T14:23:49Z", pillar: "bias_fairness", action: "allow", latency: 204, policy: "v2.3.1", sha256: "2e81" },
  { id: "evt_01fa93c5", timestamp: "2026-05-13T14:23:51Z", pillar: "compliance_pii", action: "allow", latency: 176, policy: "v2.3.1", sha256: "9d56" },
  { id: "evt_e8b21d40", timestamp: "2026-05-13T14:23:54Z", pillar: "hallucination", action: "allow", latency: 291, policy: "v2.3.1", sha256: "3a0f" },
];

const ACTION_COLORS: Record<string, string> = {
  allow: "#6fa98f",
  flag: "#c2a06a",
  block: "#be7468",
  mask: "#aab8c0",
};

export function TimeSeriesLedger() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleEntries, setVisibleEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setVisibleEntries(AUDIT_ENTRIES), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="vdx-ledger-container">
      <div className="vdx-ledger-header">
        <span className="vdx-mono-label">AUDIT TRAIL</span>
        <span className="vdx-mono-value">IMMUTABLE · CRYPTOGRAPHICALLY SIGNED</span>
      </div>
      <div className="vdx-ledger-timeline">
        {visibleEntries.map((entry, i) => (
          <motion.div
            key={entry.id}
            className={`vdx-ledger-node ${expandedId === entry.id ? 'expanded' : ''}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, stiffness: 300, damping: 30 }}
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          >
            <div className="vdx-ledger-connector">
              <div className="vdx-ledger-line" />
              <div className="vdx-ledger-dot" style={{ background: ACTION_COLORS[entry.action] }} />
            </div>
            <div className="vdx-ledger-content">
              <div className="vdx-ledger-summary">
                <span className="vdx-ledger-id">{entry.id}</span>
                <span className="vdx-ledger-pillar">{entry.pillar}</span>
                <span className="vdx-ledger-action" style={{ color: ACTION_COLORS[entry.action] }}>{entry.action}</span>
                <span className="vdx-ledger-latency">{entry.latency}ms</span>
              </div>
              <AnimatePresence>
                {expandedId === entry.id && (
                  <motion.div
                    className="vdx-ledger-json"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ stiffness: 300, damping: 30 }}
                  >
                    <pre>{JSON.stringify({
                      event_id: entry.id,
                      timestamp: entry.timestamp,
                      pillar: entry.pillar,
                      action: entry.action,
                      latency_ms: entry.latency,
                      policy_version: entry.policy,
                      sha256_prefix: entry.sha256
                    }, null, 2)}</pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
