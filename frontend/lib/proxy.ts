import { NextResponse } from "next/server";

/**
 * Parse a fetch Response as JSON without throwing on empty or non-JSON
 * (e.g. HTML 5xx) bodies. Returns null when the body isn't valid JSON, so
 * callers never surface the cryptic "Unexpected token '<', '<!DOCTYPE'" error.
 */
export async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Clean JSON 503 for when an upstream backend service is unreachable
 * (connection refused, DNS, timeout) — keeps the UI degrading gracefully
 * instead of crashing on an HTML error page.
 */
export function serviceUnavailable(service = "service") {
  return NextResponse.json(
    { error: `The ${service} is temporarily unavailable. Please try again in a moment.` },
    { status: 503 },
  );
}

/** Extract a human-readable message from a parsed (or failed) JSON error body. */
export function errorMessage(payload: unknown, fallback = "Request failed"): string {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.detail === "string") return p.detail;
    if (typeof p.error === "string") return p.error;
    if (typeof p.message === "string") return p.message;
  }
  return fallback;
}
