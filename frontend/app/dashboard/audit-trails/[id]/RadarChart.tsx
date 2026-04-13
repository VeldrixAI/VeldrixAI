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
            fill: "rgba(240,242,255,0.45)",
            fontSize: 11,
            fontFamily: "DM Sans, sans-serif",
          }}
        />
        <Radar
          name="Risk"
          dataKey="score"
          stroke="#7C3AED"
          fill="#7C3AED"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 3, fill: "#06B6D4", stroke: "#fff", strokeWidth: 1 }}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
