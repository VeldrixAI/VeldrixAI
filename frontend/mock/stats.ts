import type { KPI, TimeSeriesPoint, EnforcementOutcome, ViolationCategory, SystemHealth } from "./types";

export const kpis: KPI[] = [
  {
    label: "Total Requests (24h)",
    value: "12,847",
    change: 8.3,
    changeLabel: "vs yesterday",
    icon: "activity",
  },
  {
    label: "Approved Rate",
    value: "94.2%",
    change: 1.1,
    changeLabel: "vs last week",
    icon: "check-circle",
  },
  {
    label: "Blocked Rate",
    value: "3.8%",
    change: -0.5,
    changeLabel: "vs last week",
    icon: "shield",
  },
  {
    label: "Escalated Rate",
    value: "2.0%",
    change: 0.3,
    changeLabel: "vs last week",
    icon: "alert-triangle",
  },
  {
    label: "Avg Latency",
    value: "127ms",
    change: -12,
    changeLabel: "ms vs last week",
    icon: "clock",
  },
  {
    label: "Active Policies",
    value: 14,
    change: 2,
    changeLabel: "new this week",
    icon: "file-text",
  },
];

function generateTimeSeries(days: number): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const base = 10000 + Math.floor(Math.random() * 5000);
    const approved = Math.floor(base * (0.90 + Math.random() * 0.06));
    const blocked = Math.floor(base * (0.02 + Math.random() * 0.03));
    const escalated = Math.floor(base * (0.01 + Math.random() * 0.02));
    const rewritten = base - approved - blocked - escalated;
    data.push({
      date: date.toISOString().split("T")[0],
      requests: base,
      approved,
      blocked,
      escalated,
      rewritten: Math.max(0, rewritten),
    });
  }
  return data;
}

export const timeSeries7d: TimeSeriesPoint[] = generateTimeSeries(7);
export const timeSeries14d: TimeSeriesPoint[] = generateTimeSeries(14);
export const timeSeries30d: TimeSeriesPoint[] = generateTimeSeries(30);

export const enforcementOutcomes: EnforcementOutcome[] = [
  { date: "Mon", allow: 2340, block: 120, rewrite: 85, escalate: 45 },
  { date: "Tue", allow: 2510, block: 98, rewrite: 72, escalate: 38 },
  { date: "Wed", allow: 2680, block: 145, rewrite: 93, escalate: 52 },
  { date: "Thu", allow: 2420, block: 110, rewrite: 88, escalate: 41 },
  { date: "Fri", allow: 2790, block: 132, rewrite: 77, escalate: 49 },
  { date: "Sat", allow: 1850, block: 75, rewrite: 54, escalate: 28 },
  { date: "Sun", allow: 1620, block: 63, rewrite: 41, escalate: 22 },
];

export const violationCategories: ViolationCategory[] = [
  { name: "PII Exposure", value: 342, color: "#ef4444" },
  { name: "Prompt Injection", value: 218, color: "#f97316" },
  { name: "Content Policy", value: 187, color: "#eab308" },
  { name: "Data Exfiltration", value: 134, color: "#8b5cf6" },
  { name: "Jailbreak Attempt", value: 96, color: "#ec4899" },
  { name: "Rate Limit", value: 78, color: "#06b6d4" },
  { name: "Unauthorized Access", value: 52, color: "#10b981" },
];

export const systemHealth: SystemHealth = {
  uptime: "99.97%",
  p95Latency: "142ms",
  errorRate: "0.03%",
  trustEngineVersion: "v2.4.1",
  policyVersion: "v1.12.0",
};
