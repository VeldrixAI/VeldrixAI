"use client";

import { useEffect, useRef, useCallback } from "react";

export interface NotificationPayload {
  id: string;
  user_id: string;
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
  unread_count_delta?: number;
}

interface UseNotificationSocketOptions {
  userId: string | null;
  token: string | null;
  onNotification: (payload: NotificationPayload) => void;
  onTokenExpired?: () => void;
  enabled?: boolean;
}

/**
 * Maintains a persistent WebSocket to the core service.
 * Reconnects automatically on close with a 3-second back-off.
 * Sends a keep-alive "ping" every 25 seconds.
 */
export function useNotificationSocket({
  userId,
  token,
  onNotification,
  onTokenExpired,
  enabled = true,
}: UseNotificationSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;
  const onTokenExpiredRef = useRef(onTokenExpired);
  onTokenExpiredRef.current = onTokenExpired;
  // Holds the latest `connect` so the reconnect timer can call it without
  // referencing `connect` inside its own definition.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!userId || !token || !enabled || !mountedRef.current) return;

    const coreUrl =
      process.env.NEXT_PUBLIC_VELDRIX_CORE_URL ||
      (process.env.NODE_ENV === "production" ? "" : "http://localhost:8001");
    if (!coreUrl) return;
    const wsBase = coreUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");

    const url = `${wsBase}/ws/notifications/${encodeURIComponent(userId)}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25_000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "TRUST_VIOLATION" && msg.data) {
          onNotificationRef.current(msg.data as NotificationPayload);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = (event) => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (!mountedRef.current) return;
      // 4001 = token expired/invalid — request a fresh token, don't reconnect with stale one
      if (event.code === 4001 || event.code === 4003) {
        onTokenExpiredRef.current?.();
        return;
      }
      reconnectRef.current = setTimeout(() => connectRef.current(), 3_000);
    };

    ws.onerror = () => ws.close();
  }, [userId, token, enabled]);
  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
