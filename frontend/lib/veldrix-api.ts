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
    ? process.env.NEXT_PUBLIC_VELDRIX_CORE_URL
    : undefined
) ?? "http://localhost:8001";

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

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id:               string;
  request_id:       string;
  created_at:       string;
  verdict:          "ALLOW" | "WARN" | "REVIEW" | "BLOCK";
  overall_score:    number;
  pillar_scores:    Record<string, number>;
  flags:            string[];
  total_latency_ms: number;
  sdk_version:      string | null;
  prompt_preview:   string | null;
  report_id:        string | null;
}

export interface AuditLogListResponse {
  items:       AuditLogRow[];
  total:       number;
  page:        number;
  per_page:    number;
  total_pages: number;
}

export async function fetchAuditLogs(
  page = 1,
  perPage = 50,
  verdict?: string,
): Promise<AuditLogListResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (verdict) params.set("verdict", verdict);
  const res = await fetch(`${BASE}/api/v1/audit?${params}`, {
    headers: { "X-Veldrix-Key": KEY },
  });
  if (!res.ok) throw new Error(`Audit fetch failed: HTTP ${res.status}`);
  return res.json();
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportRow {
  id:               string;
  request_id:       string;
  created_at:       string;
  status:           "generating" | "ready" | "error";
  title:            string;
  file_size_bytes:  number | null;
}

export interface ReportListResponse {
  items: ReportRow[];
  total: number;
}

export async function generateReport(requestId: string): Promise<ReportRow> {
  const res = await fetch(`${BASE}/api/v1/reports/generate/${requestId}`, {
    method:  "POST",
    headers: { "X-Veldrix-Key": KEY },
  });
  if (!res.ok) throw new Error(`Report generation failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchReports(): Promise<ReportListResponse> {
  const res = await fetch(`${BASE}/api/v1/reports`, {
    headers: { "X-Veldrix-Key": KEY },
  });
  if (!res.ok) throw new Error(`Reports fetch failed: HTTP ${res.status}`);
  return res.json();
}

export function downloadReportUrl(reportId: string): string {
  return `${BASE}/api/v1/reports/${reportId}/download`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface StatsSummary {
  total_requests:    number;
  avg_trust_score:   number;
  avg_latency_ms:    number;
  verdict_breakdown: Record<string, number>;
  pillar_averages:   Record<string, number | null>;
  daily_volume:      { date: string; count: number }[];
  period_days:       number;
}

export async function fetchStatsSummary(days = 30): Promise<StatsSummary> {
  const res = await fetch(`${BASE}/api/v1/stats/summary?days=${days}`, {
    headers: { "X-Veldrix-Key": KEY },
  });
  if (!res.ok) throw new Error(`Stats fetch failed: HTTP ${res.status}`);
  return res.json();
}
