"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface BillingUsage {
  used: number;
  quota: number;
  resetDate: string;
}

interface Invoice {
  id: string;
  date: string;
  plan: string;
  status: "paid" | "pending" | "failed";
  amount: number;
}

// ── Plan metadata ─────────────────────────────────────────────────────────────

interface BillingStatus {
  plan_tier: string;
  plan_status: string;
  eval_count_month: number;
  billing_period_end: string | null;
  stripe_customer_id: string | null;
}

const PLAN_META: Record<string, { name: string; price: number; quota: number }> = {
  free:  { name: "Free",  price: 0,      quota: 500 },
  grow:  { name: "Grow",  price: 99,     quota: 10000 },
  scale: { name: "Scale", price: 499,    quota: 100000 },
};


// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: "var(--vx-font-body)",
      fontWeight: 600,
      fontSize: "9px",
      letterSpacing: "3px",
      textTransform: "uppercase",
      color: "var(--vx-text-dim)",
      marginBottom: "16px",
    }}>
      {children}
    </div>
  );
}

function CardBase({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: "var(--vx-card-bg)",
      border: "1px solid var(--vx-card-border)",
      borderRadius: "16px",
      padding: "28px",
      position: "relative",
      overflow: "hidden",
      transition: "box-shadow 0.25s",
      ...style,
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 28px rgba(124,58,237,0.09)"; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      {children}
    </div>
  );
}

// ── Custom Recharts Tooltip ───────────────────────────────────────────────────

function VxTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(15,13,31,0.92)",
      border: "1px solid rgba(124,58,237,0.30)",
      borderRadius: "8px",
      padding: "10px 14px",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ fontFamily: "var(--vx-font-body)", fontSize: "10px", color: "rgba(240,242,255,0.55)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontFamily: "var(--vx-font-mono)", fontSize: "11px", color: "rgba(240,242,255,0.85)" }}>{payload[0].value} requests</div>
    </div>
  );
}

// ── SDK stats type (subset) ───────────────────────────────────────────────────

interface SdkStats {
  total_requests: number;
  avg_trust_score: number;
  avg_latency_ms: number;
  verdict_breakdown: Record<string, number>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [period, setPeriod] = useState<"30d" | "90d" | "1y">("30d");
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [timeseries, setTimeseries] = useState<{ ts: string; requests: number }[]>([]);
  const [sdkStats, setSdkStats] = useState<SdkStats | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setBillingStatus(data); })
      .catch(() => {});

    fetch("/api/sdk-stats?range=30d")
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setSdkStats(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const rangeParam = period === "1y" ? "365d" : period;
    fetch(`/api/analytics?path=timeseries&range=${rangeParam}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTimeseries(data); })
      .catch(() => {});
  }, [period]);

  // Derive usage and plan from real billing status
  const planMeta = PLAN_META[billingStatus?.plan_tier ?? "free"] ?? PLAN_META.free;
  const usage: BillingUsage = {
    used: billingStatus?.eval_count_month ?? 0,
    quota: planMeta.quota,
    resetDate: billingStatus?.billing_period_end
      ? new Date(billingStatus.billing_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—",
  };
  const plan = {
    name: planMeta.name,
    priceMonthly: planMeta.price,
    nextBillingDate: billingStatus?.billing_period_end
      ? new Date(billingStatus.billing_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—",
    amountDue: planMeta.price,
    status: (billingStatus?.plan_status ?? "active") as "active",
  };
  const currentTier = billingStatus?.plan_tier ?? "free";

  const pct = usage.quota > 0 ? (usage.used / usage.quota) * 100 : 0;
  const pctLabel = pct.toFixed(1);
  const remaining = usage.quota - usage.used;

  // Chart data — real timeseries only; empty array renders empty state
  const rawCounts = timeseries.map((d) => d.requests);
  const labels = timeseries.map((d) =>
    new Date(d.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );
  const maxCount = rawCounts.length > 0 ? Math.max(...rawCounts) : 0;
  const chartData = rawCounts.map((count, i) => ({ date: labels[i], count }));

  const fmtCurrency = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  const statusBadge = (status: Invoice["status"]) => {
    const map = {
      paid:    { bg: "var(--vx-emerald-lt)", color: "var(--vx-emerald)", border: "rgba(16,185,129,0.22)" },
      pending: { bg: "var(--vx-amber-lt)",   color: "var(--vx-amber)",   border: "rgba(245,158,11,0.22)" },
      failed:  { bg: "var(--vx-rose-lt)",    color: "var(--vx-rose)",    border: "rgba(244,63,94,0.22)"  },
    };
    const s = map[status];
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 9px",
        borderRadius: "5px",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: "var(--vx-font-body)",
        fontWeight: 700,
        fontSize: "9px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="vx-content" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Section 1: Header ─────────────────────────────────────────────── */}
      <div className="vx-fade-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{
            fontFamily: "var(--vx-font-display)",
            fontWeight: 800,
            fontSize: "34px",
            letterSpacing: "-1px",
            color: "var(--vx-text-primary)",
            lineHeight: 1,
            margin: 0,
          }}>
            Billing <span style={{ color: "var(--vx-violet)" }}>&</span> Usage
          </h1>
          <p style={{
            fontFamily: "var(--vx-font-body)",
            fontWeight: 300,
            fontSize: "14px",
            color: "var(--vx-text-muted)",
            maxWidth: "520px",
            lineHeight: 1.6,
            marginTop: "8px",
            marginBottom: 0,
          }}>
            Monitor enterprise governance resource consumption and manage your subscription. All charges are billed monthly in USD.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
          <button style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 20px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(240,242,255,0.60)",
            fontFamily: "var(--vx-font-body)",
            fontWeight: 500,
            fontSize: "9px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>download</span>
            Export Invoices
          </button>
          <button style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 20px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            border: "none",
            color: "#fff",
            fontFamily: "var(--vx-font-display)",
            fontWeight: 700,
            fontSize: "9px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.86"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          onClick={async () => {
            const nextPlan = currentTier === "free" ? "grow" : "scale";
            try {
              const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: nextPlan, cycle: "monthly" }),
              });
              const data = await res.json();
              if (data.checkout_url) window.location.href = data.checkout_url;
            } catch { /* silent */ }
          }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>upgrade</span>
            Upgrade Plan
          </button>
        </div>
      </div>

      {/* ── Section 2: Summary Row ────────────────────────────────────────── */}
      <div className="vx-fade-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>

        {/* 2a — Usage Tracker */}
        <CardBase>
          {/* Top accent */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #7c3aed, #4f46e5)", borderRadius: "16px 16px 0 0" }} />
          <SectionLabel>Resource Consumption</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {/* Conic gauge */}
            <div style={{
              width: "180px",
              height: "180px",
              borderRadius: "50%",
              background: `conic-gradient(#7c3aed 0% ${pct}%, rgba(124,58,237,0.10) ${pct}% 100%)`,
              boxShadow: "0 0 40px rgba(124,58,237,0.20)",
              position: "relative",
              flexShrink: 0,
            }}>
              <div style={{
                position: "absolute",
                inset: "14px",
                borderRadius: "50%",
                background: "#0d1120",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
              }}>
                <span style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "28px", letterSpacing: "-1px", color: "var(--vx-violet)", lineHeight: 1 }}>
                  {pctLabel}%
                </span>
                <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--vx-text-dim)" }}>
                  USED
                </span>
              </div>
            </div>
            {/* Stats column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
              <div>
                <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "32px", letterSpacing: "-1px", color: "var(--vx-text-primary)", lineHeight: 1 }}>
                  {usage.used.toLocaleString()}
                </div>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "var(--vx-text-muted)", marginTop: "3px" }}>
                  of {usage.quota.toLocaleString()} requests used
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "10px", color: "var(--vx-text-dim)", letterSpacing: "1px" }}>Monthly quota</span>
                  <span style={{ fontFamily: "var(--vx-font-mono)", fontWeight: 400, fontSize: "10px", color: "var(--vx-violet)" }}>{remaining} left</span>
                </div>
                <div style={{ height: "6px", background: "rgba(124,58,237,0.10)", borderRadius: "99px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #7c3aed, #4f46e5)",
                    borderRadius: "99px",
                    transition: "width 1s ease",
                  }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{
                  background: "var(--vx-violet-lt)",
                  color: "var(--vx-violet)",
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "9px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "5px",
                  border: "1px solid rgba(124,58,237,0.20)",
                }}>
                  RESETS {usage.resetDate}
                </span>
                <button style={{
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "10px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--vx-violet)",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}>
                  Increase Limit →
                </button>
              </div>
            </div>
          </div>
        </CardBase>

        {/* 2b — Current Plan */}
        <CardBase style={{ borderLeft: "3px solid var(--vx-violet)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
            <div>
              <SectionLabel>Current Plan</SectionLabel>
              <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "22px", letterSpacing: "-0.5px", color: "var(--vx-text-primary)", marginTop: "6px" }}>
                {billingStatus ? plan.name : "Loading…"}
              </div>
            </div>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              borderRadius: "5px",
              background: plan.status === "active" ? "var(--vx-emerald-lt)" : "var(--vx-amber-lt)",
              color: plan.status === "active" ? "var(--vx-emerald)" : "var(--vx-amber)",
              border: `1px solid ${plan.status === "active" ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
              fontFamily: "var(--vx-font-body)",
              fontWeight: 700,
              fontSize: "9px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              flexShrink: 0,
              marginTop: "2px",
            }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: plan.status === "active" ? "var(--vx-emerald)" : "var(--vx-amber)", animation: "vx-blink 2s ease-in-out infinite" }} />
              {billingStatus?.plan_status ?? "Active"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "16px 0 20px" }}>
            <span style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-1.5px", color: "var(--vx-violet)" }}>
              ${plan.priceMonthly.toLocaleString()}
            </span>
            <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "var(--vx-text-dim)" }}>/month</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            borderTop: "1px solid var(--vx-divider)",
            borderBottom: "1px solid var(--vx-divider)",
            padding: "16px 0",
            marginBottom: "20px",
          }}>
            {[
              { label: "Next Billing", value: plan.nextBillingDate },
              { label: "Amount Due",   value: fmtCurrency(plan.amountDue) },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--vx-text-dim)", marginBottom: "3px" }}>{item.label}</div>
                <div style={{ fontFamily: "var(--vx-font-mono)", fontWeight: 500, fontSize: "12px", color: "var(--vx-text-primary)" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "none",
              color: "#fff",
              fontFamily: "var(--vx-font-display)",
              fontWeight: 700,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>
              Upgrade Plan
            </button>
            <button
              style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(240,242,255,0.60)",
                fontFamily: "var(--vx-font-body)",
                fontWeight: 500,
                fontSize: "10px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
              onClick={async () => {
                try {
                  const res = await fetch("/api/billing/portal", { method: "POST" });
                  const data = await res.json();
                  if (data.portal_url) window.location.href = data.portal_url;
                } catch { /* silent */ }
              }}
            >
              Manage Payment Methods
            </button>
          </div>
        </CardBase>

        {/* 2c — Quick Stats */}
        <CardBase>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #10b981, #06b6d4)", borderRadius: "16px 16px 0 0" }} />
          <SectionLabel>Usage Breakdown</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[
              {
                label: "SDK Requests",
                value: sdkStats ? sdkStats.total_requests.toLocaleString() : "—",
                sub: "Last 30 days",
                color: "var(--vx-violet)",
              },
              {
                label: "Avg Latency",
                value: sdkStats?.avg_latency_ms ? `${sdkStats.avg_latency_ms}ms` : "—",
                sub: "Evaluation pipeline",
                color: "rgba(240,242,255,0.90)",
              },
              {
                label: "Blocked",
                value: sdkStats ? (sdkStats.verdict_breakdown?.BLOCK ?? 0).toLocaleString() : "—",
                sub: "Prompt security",
                color: "var(--vx-rose)",
              },
              {
                label: "Avg Trust Score",
                value: sdkStats?.avg_trust_score != null
                  ? `${(sdkStats.avg_trust_score * 100).toFixed(1)}%`
                  : "—",
                sub: "Composite pillar score",
                color: "var(--vx-emerald)",
              },
            ].map((chip) => (
              <div key={chip.label} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(124,58,237,0.18)",
                borderRadius: "10px",
                padding: "14px 18px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 500, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--vx-text-dim)" }}>{chip.label}</div>
                <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "22px", letterSpacing: "-0.5px", color: chip.color, lineHeight: 1 }}>{chip.value}</div>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "11px", color: "var(--vx-text-muted)", marginTop: "1px" }}>{chip.sub}</div>
              </div>
            ))}
          </div>
        </CardBase>
      </div>

      {/* ── Section 3: Request Velocity Chart ────────────────────────────── */}
      <CardBase className="vx-fade-3" style={{ padding: "28px" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #7c3aed, #06b6d4)", opacity: 0.5, borderRadius: "16px 16px 0 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 700, fontSize: "16px", letterSpacing: "-0.3px", color: "var(--vx-text-primary)" }}>
              Audit Request Velocity
            </div>
            <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "var(--vx-text-dim)", marginTop: "2px" }}>
              Daily request volume across all evaluation pipelines
            </div>
          </div>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "3px", gap: "2px" }}>
            {(["30d", "90d", "1y"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "10px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: period === p ? "rgba(124,58,237,0.22)" : "transparent",
                  color: period === p ? "#c4b5fd" : "rgba(240,242,255,0.40)",
                  boxShadow: period === p ? "0 1px 8px rgba(124,58,237,0.25)" : "none",
                }}
              >
                {p === "30d" ? "30 Days" : p === "90d" ? "90 Days" : "Year"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: chartData.length === 0 ? "center" : undefined }}>
          {chartData.length === 0 ? (
            <p style={{ fontFamily: "var(--vx-font-body)", fontSize: "12px", color: "var(--vx-text-dim)", letterSpacing: "2px", textTransform: "uppercase" }}>
              No traffic data for this period
            </p>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <XAxis
                dataKey="date"
                tick={{ fill: "#9ca3af", fontSize: 9, fontFamily: "DM Sans" }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(chartData.length / 7)}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 9, fontFamily: "JetBrains Mono" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={32}
              />
              <Tooltip content={<VxTooltip />} cursor={{ fill: "rgba(124,58,237,0.04)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => {
                  const ratio = entry.count / maxCount;
                  const fill = ratio > 0.8 ? "#7c3aed" : ratio > 0.5 ? "rgba(124,58,237,0.55)" : "rgba(124,58,237,0.22)";
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
          <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--vx-text-dim)" }}>
            {chartData[0]?.date}
          </span>
          <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--vx-text-dim)" }}>
            Today · {chartData[chartData.length - 1]?.date}
          </span>
        </div>
      </CardBase>

      {/* ── Section 4: Plan Comparison ────────────────────────────────────── */}
      <div className="vx-fade-4">
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 700, fontSize: "20px", letterSpacing: "-0.5px", color: "var(--vx-text-primary)" }}>
            Compare Plans
          </div>
          <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "13px", color: "var(--vx-text-muted)", marginTop: "4px" }}>
            All plans include core governance infrastructure. Upgrade for higher limits and advanced features.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>

          {/* Enterprise Pro — current (dark) */}
          <div style={{
            borderRadius: "16px",
            padding: "28px",
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(135deg, #0f0d1f 0%, #1a1040 50%, #0a0e24 100%)",
            border: "1px solid rgba(124,58,237,0.35)",
            boxShadow: "0 12px 48px rgba(124,58,237,0.20)",
            transition: "box-shadow 0.25s, transform 0.25s",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
          >
            {/* Shimmer top line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.8), rgba(6,182,212,0.6), transparent)" }} />
            {/* Badge */}
            <div style={{ position: "absolute", top: "18px", right: "18px" }}>
              <span style={{
                background: "rgba(124,58,237,0.20)",
                color: "#c4b5fd",
                fontFamily: "var(--vx-font-body)",
                fontWeight: 700,
                fontSize: "8px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                padding: "4px 10px",
                borderRadius: "100px",
                border: "1px solid rgba(124,58,237,0.30)",
              }}>
                Current Plan
              </span>
            </div>
            <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.3px", color: "#ffffff", marginBottom: "6px" }}>
              {billingStatus ? plan.name : "Loading…"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-1.5px", color: "#ffffff" }}>${planMeta.price.toLocaleString()}</span>
              <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "rgba(240,242,255,0.40)", marginLeft: "4px" }}>/month</span>
            </div>
            <div style={{ margin: "0 0 20px", display: "flex", flexDirection: "column" }}>
              {[`${planMeta.quota.toLocaleString()} audit requests / month`, "All 5 evaluation pillars", "Advanced enforcement rules", "90-day audit log retention", "SLA guarantee — 99.9%", "Dedicated support"].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--vx-cyan)", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "12px", color: "rgba(240,242,255,0.65)" }}>{f}</span>
                </div>
              ))}
            </div>
            <button style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: "10px",
              background: "rgba(124,58,237,0.20)",
              color: "#c4b5fd",
              border: "1px solid rgba(124,58,237,0.30)",
              fontFamily: "var(--vx-font-body)",
              fontWeight: 600,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: "not-allowed",
            }}>
              Current Plan
            </button>
          </div>

          {/* Growth — light */}
          {[
            {
              name: "Growth",
              price: "$699",
              features: ["200 audit requests / month", "All 5 evaluation pillars", "Standard enforcement rules", "30-day audit log retention", "Email support"],
            },
            {
              name: "Starter",
              price: "$299",
              features: ["50 audit requests / month", "3 evaluation pillars", "Basic enforcement rules", "7-day audit log retention", "Community support"],
            },
          ].map((p) => (
            <div key={p.name}
              style={{
                borderRadius: "16px",
                padding: "28px",
                position: "relative",
                overflow: "hidden",
                background: "var(--vx-card-bg)",
                border: "1px solid var(--vx-card-border)",
                transition: "box-shadow 0.25s, transform 0.25s, border-color 0.25s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(-3px)";
                el.style.borderColor = "rgba(124,58,237,0.30)";
                el.style.boxShadow = "0 8px 32px rgba(124,58,237,0.08)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(0)";
                el.style.borderColor = "var(--vx-card-border)";
                el.style.boxShadow = "none";
              }}
            >
              <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.3px", color: "var(--vx-text-primary)", marginBottom: "6px" }}>
                {p.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
                <span style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-1.5px", color: "var(--vx-violet)" }}>{p.price}</span>
                <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "var(--vx-text-dim)", marginLeft: "4px" }}>/month</span>
              </div>
              <div style={{ margin: "0 0 20px", display: "flex", flexDirection: "column" }}>
                {p.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--vx-emerald)", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "12px", color: "var(--vx-text-secondary)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: "10px",
                background: "transparent",
                color: "var(--vx-violet)",
                border: "1px solid rgba(124,58,237,0.30)",
                fontFamily: "var(--vx-font-body)",
                fontWeight: 600,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--vx-violet-lt)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
              >
                Downgrade
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 5: Payment Method ─────────────────────────────────────── */}
      <CardBase className="vx-fade-5">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <SectionLabel>Payment Method</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{
                width: "48px",
                height: "32px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #1e1b4b, #312e81)",
                border: "1px solid rgba(124,58,237,0.20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "rgba(124,58,237,0.8)" }}>credit_card</span>
              </div>
              <div>
                <div style={{ fontFamily: "var(--vx-font-mono)", fontWeight: 500, fontSize: "13px", color: "var(--vx-text-primary)" }}>
                  •••• •••• •••• 4242
                </div>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "11px", color: "var(--vx-text-dim)", marginTop: "2px" }}>
                  Expires 09/26
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { label: "Update Card", primary: true },
              { label: "Add Payment Method", primary: false },
            ].map((btn) => (
              <button key={btn.label} style={{
                padding: "9px 18px",
                borderRadius: "10px",
                fontFamily: "var(--vx-font-body)",
                fontWeight: btn.primary ? 600 : 500,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.2s",
                background: btn.primary ? "transparent" : "rgba(255,255,255,0.06)",
                color: btn.primary ? "var(--vx-violet)" : "rgba(240,242,255,0.60)",
                border: btn.primary ? "1px solid rgba(124,58,237,0.30)" : "1px solid rgba(255,255,255,0.10)",
              }}
              onMouseEnter={(e) => {
                if (btn.primary) (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.15)";
                else (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)";
              }}
              onMouseLeave={(e) => {
                if (btn.primary) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                else (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
              }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </CardBase>

      {/* ── Section 6: Billing History ────────────────────────────────────── */}
      <div className="vx-fade-6" style={{
        background: "var(--vx-card-bg)",
        border: "1px solid var(--vx-card-border)",
        borderRadius: "16px",
        overflow: "hidden",
      }}>
        {/* Table header */}
        <div style={{
          padding: "20px 28px",
          borderBottom: "1px solid var(--vx-divider)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "var(--vx-font-display)", fontWeight: 700, fontSize: "16px", color: "var(--vx-text-primary)" }}>Billing History</div>
            <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "11px", color: "var(--vx-text-dim)", marginTop: "2px" }}>
              Complete invoice history for your VeldrixAI subscription
            </div>
          </div>
          <button style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "8px",
            background: "var(--vx-violet-lt)",
            color: "var(--vx-violet)",
            border: "1px solid rgba(124,58,237,0.25)",
            fontFamily: "var(--vx-font-body)",
            fontWeight: 600,
            fontSize: "9px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s, color 0.2s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "var(--vx-violet)";
            el.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "var(--vx-violet-lt)";
            el.style.color = "var(--vx-violet)";
          }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>download</span>
            Export CSV
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Invoice ID", "Billing Date", "Plan", "Status", "Amount", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "12px 20px",
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "9px",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "rgba(240,242,255,0.40)",
                  textAlign: i >= 4 ? "right" : "left",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} style={{ padding: "40px 20px", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "28px", color: "rgba(124,58,237,0.40)", display: "block", marginBottom: "10px" }}>receipt_long</span>
                <div style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "13px", color: "var(--vx-text-muted)" }}>
                  Invoice history is available in the Stripe Customer Portal.
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/billing/portal", { method: "POST" });
                      const data = await res.json();
                      if (data.portal_url) window.location.href = data.portal_url;
                    } catch { /* silent */ }
                  }}
                  style={{
                    marginTop: "12px",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    background: "var(--vx-violet-lt)",
                    color: "var(--vx-violet)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    fontFamily: "var(--vx-font-body)",
                    fontWeight: 600,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Open Billing Portal
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Table footer / pagination */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)" }}>
            Invoice history via Stripe Portal
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["chevron_left", "chevron_right"] as const).map((icon) => (
              <button key={icon} style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                border: "1px solid rgba(124,58,237,0.20)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(240,242,255,0.50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "var(--vx-violet)";
                el.style.color = "#fff";
                el.style.borderColor = "var(--vx-violet)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = "rgba(255,255,255,0.06)";
                el.style.color = "rgba(240,242,255,0.50)";
                el.style.borderColor = "rgba(124,58,237,0.20)";
              }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>{icon}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
