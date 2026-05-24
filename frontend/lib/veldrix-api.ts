/**
 * VeldrixAI API client — typed, production-grade.
 * Calls POST /api/v1/analyze and subscribes to GET /api/v1/stream SSE.
 *
 * Environment variables (set in frontend/.env.local):
 *   NEXT_PUBLIC_VELDRIX_CORE_URL  — base URL of veldrix-core (default: http://localhost:8001)
 *   NEXT_PUBLIC_VELDRIX_KEY       — X-Veldrix-Key header value
 */

const BASE = (
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_VELDRIX_CORE_API_URL ?? process.env.NEXT_PUBLIC_VELDRIX_CORE_URL)
    : undefined
) ?? "https://api.veldrixai.ca";

const KEY = (
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_VELDRIX_KEY
    : undefined
) ?? "";

export interface PillarResult {
  pillar:      string;
  status:      "ok" | "error" | "skip";
  score:       number | null;
  confidence:  number | null;
  flags:       string[];
  latency_ms:  number | null;
  error?:      string;
}

export interface TrustScore {
  overall:        number;
  verdict:        "ALLOW" | "WARN" | "REVIEW" | "BLOCK";
  critical_flags: string[];
  all_flags:      string[];
  pillar_scores:  Record<string, number>;
}

export interface AnalysisResult {
  request_id:       string;
  trust_score:      TrustScore;
  pillars:          Record<string, PillarResult>;
  total_latency_ms: number;
  sdk_version:      string;
  timestamp:        number;
}

export async function analyzeRequest(
  prompt:   string,
  response: string,
  context?: string,
): Promise<AnalysisResult> {
  const res = await fetch(`${BASE}/api/v1/analyze`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "X-Veldrix-Key": KEY,
    },
    body: JSON.stringify({ prompt, response, context }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AnalysisResult>;
}

/**
 * Subscribe to real-time analysis events via SSE.
 * Returns a cleanup function — call it on component unmount.
 */
export function subscribeToAnalysisStream(
  onResult: (result: AnalysisResult) => void,
  onError?: (e: Event) => void,
): () => void {
  const es = new EventSource(`${BASE}/api/v1/stream`);

  es.addEventListener("analysis_complete", (e: MessageEvent) => {
    try {
      onResult(JSON.parse(e.data) as AnalysisResult);
    } catch {
      // ignore malformed events
    }
  });

  if (onError) es.onerror = onError;

  return () => es.close();
}

