"use client";

interface Props {
  onAllow: () => void;
  onDismiss: () => void;
}

export function BrowserPermissionPrompt({ onAllow, onDismiss }: Props) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 320,
          background: "#0C0F1A",
          border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: 14,
          padding: "18px 20px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          zIndex: 51,
          animation: "veldrix-panel-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#F0F2FF",
            fontFamily: "Syne, sans-serif",
            marginBottom: 8,
          }}
        >
          Enable trust violation alerts
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(240,242,255,0.45)",
            fontFamily: "DM Sans, sans-serif",
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Get instant OS notifications when VeldrixAI intercepts a flagged or
          blocked request — even when this tab is in the background.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onAllow}
            style={{
              flex: 1,
              background: "#7C3AED",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "7px 0",
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: "DM Sans, sans-serif",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
            }
          >
            Enable alerts
          </button>
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              color: "rgba(240,242,255,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "7px 0",
              fontSize: 12.5,
              fontFamily: "DM Sans, sans-serif",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.08)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.05)")
            }
          >
            Not now
          </button>
        </div>
      </div>

      <style>{`
        @keyframes veldrix-panel-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
