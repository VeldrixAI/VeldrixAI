"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Point = {
  date: string;
  count: number;
};

function VxTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(15,13,31,0.92)",
        border: "1px solid rgba(124,58,237,0.30)",
        borderRadius: "8px",
        padding: "10px 14px",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--vx-font-body)",
          fontSize: "10px",
          color: "rgba(240,242,255,0.55)",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--vx-font-mono)",
          fontSize: "11px",
          color: "rgba(240,242,255,0.85)",
        }}
      >
        {payload[0].value} requests
      </div>
    </div>
  );
}

export default function BillingVelocityChart({
  chartData,
  maxCount,
}: {
  chartData: Point[];
  maxCount: number;
}) {
  return (
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
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={32}
        />
        <Tooltip content={<VxTooltip />} cursor={{ fill: "rgba(124,58,237,0.04)" }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => {
            const ratio = entry.count / maxCount;
            const fill =
              ratio > 0.8
                ? "#7c3aed"
                : ratio > 0.5
                  ? "rgba(124,58,237,0.55)"
                  : "rgba(124,58,237,0.22)";
            return <Cell key={i} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
