"use client";

import { useState } from "react";
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

// ── Mock data ────────────────────────────────────────────────────────────────

const mockUsage: BillingUsage = { used: 342, quota: 500, resetDate: "Nov 1" };

const mockPlan = {
  name: "Enterprise Pro",
  priceMonthly: 1450,
  nextBillingDate: "Nov 24, 2024",
  amountDue: 1450.0,
  status: "active" as const,
};

const mockInvoices: Invoice[] = [
  { id: "INV-882109", date: "Oct 24, 2024", plan: "Enterprise Pro", status: "paid",    amount: 1450.0 },
  { id: "INV-881944", date: "Sep 24, 2024", plan: "Enterprise Pro", status: "paid",    amount: 1450.0 },
  { id: "INV-881521", date: "Aug 24, 2024", plan: "Enterprise Pro", status: "paid",    amount: 1450.0 },
  { id: "INV-881203", date: "Jul 24, 2024", plan: "Startup Tier",   status: "paid",    amount:  450.0 },
];

const mock30 = [12,15,8,22,28,24,18,20,34,36,30,25,22,19,12,10,15,24,30,38,35,28,24,20,15,10,8,9,18,26];
const mock90 = Array.from({ length: 90 }, (_, i) => Math.floor(8 + Math.random() * 35 + Math.sin(i/10)*10));
const mock365 = Array.from({ length: 52 }, (_, i) => Math.floor(60 + Math.random() * 200 + Math.sin(i/8)*80));

function buildLabels30() {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return labels;
}
function buildLabels90() {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return labels;
}
function buildLabels365() {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 51; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return labels;
}

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const usage = mockUsage;
  const plan = mockPlan;

  const [period, setPeriod] = useState<"30d" | "90d" | "1y">("30d");

  const pct = ((usage.used / usage.quota) * 100);
  const pctLabel = pct.toFixed(1);
  const remaining = usage.quota - usage.used;

  // Chart data
  const rawCounts = period === "90d" ? mock90 : period === "1y" ? mock365 : mock30;
  const labels = period === "90d" ? buildLabels90() : period === "1y" ? buildLabels365() : buildLabels30();
  const maxCount = Math.max(...rawCounts);
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
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            color: "#64748b",
            fontFamily: "var(--vx-font-body)",
            fontWeight: 500,
            fontSize: "9px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#e2e8f0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9"; }}
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
                background: "#ffffff",
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
                {plan.name}
              </div>
            </div>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              borderRadius: "5px",
              background: "var(--vx-emerald-lt)",
              color: "var(--vx-emerald)",
              border: "1px solid rgba(16,185,129,0.25)",
              fontFamily: "var(--vx-font-body)",
              fontWeight: 700,
              fontSize: "9px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              flexShrink: 0,
              marginTop: "2px",
            }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--vx-emerald)", animation: "vx-blink 2s ease-in-out infinite" }} />
              Active
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
            <button style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: "10px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              fontFamily: "var(--vx-font-body)",
              fontWeight: 500,
              fontSize: "10px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>
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
              { label: "API Calls Today",  value: "1,204",  sub: "+8.2% vs yesterday", color: "var(--vx-violet)" },
              { label: "Avg Latency",      value: "14ms",   sub: "P99: 22ms",          color: "#334155" },
              { label: "Blocked Today",    value: "38",     sub: "Prompt security",    color: "var(--vx-rose)" },
              { label: "Compliance Score", value: "99.8%",  sub: "SOC2 aligned",       color: "var(--vx-emerald)" },
            ].map((chip) => (
              <div key={chip.label} style={{
                background: "#ffffff",
                border: "1px solid rgba(124,58,237,0.12)",
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
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "8px", padding: "3px", gap: "2px" }}>
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
                  background: period === p ? "#ffffff" : "transparent",
                  color: period === p ? "var(--vx-violet)" : "#6b7280",
                  boxShadow: period === p ? "0 1px 4px rgba(124,58,237,0.15)" : "none",
                }}
              >
                {p === "30d" ? "30 Days" : p === "90d" ? "90 Days" : "Year"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: "220px" }}>
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
              Enterprise Pro
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "var(--vx-font-display)", fontWeight: 800, fontSize: "36px", letterSpacing: "-1.5px", color: "#ffffff" }}>$1,450</span>
              <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 300, fontSize: "12px", color: "rgba(240,242,255,0.40)", marginLeft: "4px" }}>/month</span>
            </div>
            <div style={{ margin: "0 0 20px", display: "flex", flexDirection: "column" }}>
              {["500 audit requests / month", "All 5 evaluation pillars", "Advanced enforcement rules", "90-day audit log retention", "SLA guarantee — 99.9%", "Dedicated support"].map((f) => (
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
                background: btn.primary ? "transparent" : "#f1f5f9",
                color: btn.primary ? "var(--vx-violet)" : "#64748b",
                border: btn.primary ? "1px solid rgba(124,58,237,0.30)" : "1px solid #e2e8f0",
              }}
              onMouseEnter={(e) => {
                if (btn.primary) (e.currentTarget as HTMLButtonElement).style.background = "var(--vx-violet-lt)";
                else (e.currentTarget as HTMLButtonElement).style.background = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                if (btn.primary) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                else (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9";
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
            <tr style={{ background: "#f4f3ff" }}>
              {["Invoice ID", "Billing Date", "Plan", "Status", "Amount", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "12px 20px",
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "9px",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "#6b7280",
                  textAlign: i >= 4 ? "right" : "left",
                  borderBottom: "1px solid rgba(124,58,237,0.08)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mockInvoices.map((inv, idx) => (
              <tr
                key={inv.id}
                style={{ borderBottom: idx < mockInvoices.length - 1 ? "1px solid rgba(124,58,237,0.05)" : "none", transition: "background 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(124,58,237,0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "14px 20px", fontFamily: "var(--vx-font-mono)", fontWeight: 500, fontSize: "11px", color: "var(--vx-violet)" }}>
                  {inv.id}
                </td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "13px", color: "#374151" }}>
                  {inv.date}
                </td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "13px", color: "#374151" }}>
                  {inv.plan}
                </td>
                <td style={{ padding: "14px 20px" }}>
                  {statusBadge(inv.status)}
                </td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--vx-font-display)", fontWeight: 700, fontSize: "14px", color: "var(--vx-text-primary)", textAlign: "right" }}>
                  {fmtCurrency(inv.amount)}
                </td>
                <td style={{ padding: "14px 20px", textAlign: "right" }}>
                  <button style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#9ca3af", transition: "color 0.15s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--vx-violet)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>download</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Table footer / pagination */}
        <div style={{
          background: "#f4f3ff",
          borderTop: "1px solid rgba(124,58,237,0.07)",
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--vx-font-body)", fontWeight: 400, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#9ca3af" }}>
            Showing 1–{mockInvoices.length} of 24 invoices
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["chevron_left", "chevron_right"] as const).map((icon) => (
              <button key={icon} style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                border: "1px solid rgba(124,58,237,0.15)",
                background: "#fff",
                color: "#6b7280",
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
                el.style.background = "#fff";
                el.style.color = "#6b7280";
                el.style.borderColor = "rgba(124,58,237,0.15)";
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
