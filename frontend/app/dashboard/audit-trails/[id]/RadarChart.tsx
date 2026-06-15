"use client";

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

type PillarScores = {
  safety?: number;
  hallucination?: number;
  bias?: number;
  prompt_security?: number;
  compliance?: number;
};

interface Props {
  pillarScores: PillarScores;
}

export default function RadarChart({ pillarScores }: Props) {
  // Invert scores: trust score 0-1 (higher=safer) → risk score 0-100 (higher=riskier)
  const data = [
    { subject: "Safety", score: pillarScores.safety != null ? Math.round((1 - pillarScores.safety) * 100) : 0 },
    { subject: "Hallucination", score: pillarScores.hallucination != null ? Math.round((1 - pillarScores.hallucination) * 100) : 0 },
    { subject: "Bias", score: pillarScores.bias != null ? Math.round((1 - pillarScores.bias) * 100) : 0 },
    { subject: "Prompt Sec.", score: pillarScores.prompt_security != null ? Math.round((1 - pillarScores.prompt_security) * 100) : 0 },
    { subject: "PII / Comp.", score: pillarScores.compliance != null ? Math.round((1 - pillarScores.compliance) * 100) : 0 },
  ];

  const hasData = Object.values(pillarScores).some((v) => v != null);
  if (!hasData) {
    return (
      <div style={{
        height: 300,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "rgba(231,236,239,0.2)",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12 2 22 20 2 20" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, letterSpacing: "1px", textTransform: "uppercase" }}>
          No pillar score data
        </span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
        <PolarGrid
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 3"
        />
        <PolarAngleAxis
          dataKey="subject"
          tick={{
            fill: "rgba(231,236,239,0.45)",
            fontSize: 11,
            fontFamily: "DM Sans, sans-serif",
          }}
        />
        <Radar
          name="Risk"
          dataKey="score"
          stroke="#2d4a5e"
          fill="#2d4a5e"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 3, fill: "#aab8c0", stroke: "#fff", strokeWidth: 1 }}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
