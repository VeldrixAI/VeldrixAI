"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export interface Notification {
  id: string;
  severity: "blocked" | "flagged" | "masked" | "escalated";
  pillar: string;
  enforcement: string;
  title: string;
  message: string;
  endpoint?: string;
  model_name?: string;
  agent_name?: string;
  tool_name?: string;
  is_read: boolean;
  created_at: string;
  audit_log_id?: string;
}

const SEVERITY_CONFIG: Record<
  string,
  { color: string; bg: string; label: string; icon: React.ReactNode }
> = {
  blocked: {
    color: "#F43F5E",
    bg: "rgba(244,63,94,0.12)",
    label: "BLOCKED",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F43F5E"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
  },
  flagged: {
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
    label: "FLAGGED",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  masked: {
    color: "#EC4899",
    bg: "rgba(236,72,153,0.12)",
    label: "MASKED",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#EC4899"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  escalated: {
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.12)",
    label: "ESCALATED",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#7C3AED"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkOneRead: (id: string) => void;
  onClose: () => void;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkOneRead,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function handleNotificationClick(n: Notification) {
    onMarkOneRead(n.id);
    if (n.audit_log_id) {
      router.push(`/dashboard/audit-trails/${n.audit_log_id}`);
    } else {
      router.push("/dashboard/audit-trails");
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 49 }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 400,
          maxHeight: "calc(100vh - 80px)",
          background: "#0C0F1A",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: 16,
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          animation: "veldrix-panel-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: "#F0F2FF",
                letterSpacing: "-0.2px",
              }}
            >
              Trust Alerts
            </span>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "#F43F5E",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "DM Sans, sans-serif",
                  padding: "2px 8px",
                  borderRadius: 9999,
                }}
              >
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(240,242,255,0.35)",
                fontSize: 11,
                fontFamily: "DM Sans, sans-serif",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 4,
                letterSpacing: "0.3px",
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "rgba(240,242,255,0.25)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
              }}
            >
              No alerts yet. VeldrixAI is watching.
            </div>
          ) : (
            notifications.map((n, i) => {
              const cfg =
                SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.flagged;
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    borderBottom:
                      i < notifications.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    cursor: "pointer",
                    background: !n.is_read
                      ? "rgba(124,58,237,0.05)"
                      : "transparent",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      !n.is_read ? "rgba(124,58,237,0.05)" : "transparent";
                  }}
                >
                  {/* Severity icon */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: cfg.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {cfg.icon}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          fontFamily: "DM Sans, sans-serif",
                          letterSpacing: "1px",
                          color: cfg.color,
                          textTransform: "uppercase",
                        }}
                      >
                        {cfg.label} · {n.pillar.replace(/_/g, " ")}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "rgba(240,242,255,0.25)",
                          fontFamily: "DM Sans, sans-serif",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {timeAgo(n.created_at)}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 12.5,
                        color: "rgba(240,242,255,0.85)",
                        fontFamily: "DM Sans, sans-serif",
                        lineHeight: 1.45,
                        marginBottom: 4,
                      }}
                    >
                      {n.title}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(240,242,255,0.35)",
                        fontFamily: "DM Sans, sans-serif",
                        lineHeight: 1.4,
                        marginBottom: n.model_name || n.agent_name || n.endpoint ? 4 : 0,
                      }}
                    >
                      {n.message}
                    </div>

                    {(n.model_name || n.agent_name || n.endpoint) && (
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "JetBrains Mono, monospace",
                          color: "rgba(240,242,255,0.2)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.agent_name
                          ? `agent: ${n.agent_name}`
                          : n.model_name
                          ? `model: ${n.model_name}`
                          : n.endpoint}
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#7C3AED",
                        flexShrink: 0,
                        marginTop: 6,
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => { onClose(); router.push("/dashboard/audit-trails"); }}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 12,
              color: "#7C3AED",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "0.2px",
              textDecoration: "none",
            }}
          >
            View full audit log →
          </button>
        </div>
      </div>
    </>
  );
}
