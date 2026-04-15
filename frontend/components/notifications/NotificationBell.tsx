"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useNotificationSocket,
  type NotificationPayload,
} from "@/hooks/useNotificationSocket";
import { NotificationPanel, type Notification } from "./NotificationPanel";
import { BrowserPermissionPrompt } from "./BrowserPermissionPrompt";

// ── IcoBell (matches existing dashboard icon style) ───────────────────────────
function IcoBell({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#7C3AED" : "currentColor"}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function fireBrowserNotification(n: NotificationPayload) {
  if (typeof window === "undefined" || typeof Notification === "undefined")
    return;
  try {
    const notif = new Notification(`VeldrixAI — ${n.title}`, {
      body: n.message,
      icon: "/favicon.ico",
      tag: n.id,
      requireInteraction:
        n.severity === "blocked" || n.severity === "escalated",
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Notification API unavailable in this context
  }
}

interface Props {
  userId: string;
}

/**
 * Drop-in replacement for the static bell button in the dashboard topbar.
 * Receives userId from the layout (already loaded via /api/auth/me).
 */
export function NotificationBell({ userId }: Props) {
  const LS_KEY_NOTIFS   = `veldrix_notifications_${userId}`;
  const LS_KEY_UNREAD   = `veldrix_unread_${userId}`;

  // ── Bootstrap state from localStorage (instant, before any fetch) ─────────
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(`veldrix_notifications_${userId}`);
      return raw ? (JSON.parse(raw) as Notification[]) : [];
    } catch { return []; }
  });
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem(`veldrix_unread_${userId}`);
      return raw ? Number(raw) : 0;
    } catch { return 0; }
  });

  const [isOpen, setIsOpen] = useState(false);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const [hov, setHov] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Persist to localStorage whenever state changes ────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_NOTIFS, JSON.stringify(notifications.slice(0, 50)));
    } catch {}
  }, [notifications, LS_KEY_NOTIFS]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_UNREAD, String(unreadCount));
    } catch {}
  }, [unreadCount, LS_KEY_UNREAD]);

  // ── Fetch JWT for WebSocket auth ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/notifications/ws-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.token) setWsToken(d.token); })
      .catch(() => {});
  }, []);

  // ── Initial hydration (server is source of truth, refreshes local cache) ──
  useEffect(() => {
    fetch("/api/notifications?limit=20")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) {
          setNotifications(d.items as Notification[]);
          setUnreadCount(d.unread_count ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  // ── Browser permission check on mount ────────────────────────────────────
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") setPermissionGranted(true);
    else if (Notification.permission === "denied") setPermissionGranted(false);
    // else "default" → show prompt when first notification arrives
  }, []);

  // ── WebSocket live updates ────────────────────────────────────────────────
  const handleIncoming = useCallback(
    (payload: NotificationPayload) => {
      const asNotif: Notification = {
        id: payload.id,
        severity: payload.severity,
        pillar: payload.pillar,
        enforcement: payload.enforcement,
        title: payload.title,
        message: payload.message,
        endpoint: payload.endpoint,
        model_name: payload.model_name,
        agent_name: payload.agent_name,
        tool_name: payload.tool_name,
        is_read: payload.is_read,
        created_at: payload.created_at,
        audit_log_id: payload.audit_log_id,
      };
      setNotifications((prev) => [asNotif, ...prev].slice(0, 50));
      setUnreadCount((c) => c + 1);

      // Request browser permission on first notification if still "default"
      if (permissionGranted === null) {
        setPermissionGranted(null); // keep prompt visible
      }

      if (permissionGranted && document.visibilityState === "hidden") {
        fireBrowserNotification(payload);
      }
    },
    [permissionGranted]
  );

  useNotificationSocket({
    userId,
    token: wsToken,
    onNotification: handleIncoming,
    enabled: !!wsToken,
  });

  // ── Close panel on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  };

  const handleMarkOneRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => {
      const wasUnread = notifications.find((n) => n.id === id && !n.is_read);
      return wasUnread ? Math.max(0, c - 1) : c;
    });
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(
      () => {}
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        title="Notifications"
        onClick={() => setIsOpen((o) => !o)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          padding: "8px",
          borderRadius: "50%",
          background: hov || isOpen ? "rgba(124,58,237,0.12)" : "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(240,242,255,0.6)",
          transition: "background 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <IcoBell active={unreadCount > 0} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 9999,
              background: "#F43F5E",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "DM Sans, sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              border: "2px solid #050810",
              animation: "veldrix-badge-pulse 2s ease-in-out infinite",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onMarkOneRead={handleMarkOneRead}
          onClose={() => setIsOpen(false)}
        />
      )}

      {/* Browser permission prompt — shown once on first incoming notification */}
      {permissionGranted === null && unreadCount > 0 && !isOpen && (
        <BrowserPermissionPrompt
          onAllow={async () => {
            if (typeof Notification !== "undefined") {
              const result = await Notification.requestPermission();
              setPermissionGranted(result === "granted");
            }
          }}
          onDismiss={() => setPermissionGranted(false)}
        />
      )}

      <style>{`
        @keyframes veldrix-badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.5); }
          50%       { box-shadow: 0 0 0 4px rgba(244,63,94,0); }
        }
        @keyframes veldrix-panel-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
