"use client";

import { useMemo, useRef, useEffect, useState } from "react";

interface TimingsMs {
  pillar_dispatch_ms?:  number;
  enforcement_ms?:      number;
  response_assembly_ms?: number;
  audit_enqueue_ms?:    number;
  total_ms?:            number;
  per_pillar_ms?:       Record<string, number>;
  [key: string]: unknown;
}

interface Props {
  timingsMs:     TimingsMs | null | undefined;
  totalLatencyMs: number | null;
  perPillarMs:   Record<string, number>;
  p95BudgetMs?:  number;
}

const STAGE_COLORS: Record<string, string> = {
  setup:           "#4F46E5",
  policy_lookup:   "#7C3AED",
  safety:          "#F43F5E",
  hallucination:   "#7C3AED",
  bias:            "#4F46E5",
  prompt_security: "#06B6D4",
  compliance:      "#10B981",
  enforcement:     "#f59e0b",
  response:        "#06B6D4",
  audit:           "rgba(255,255,255,0.2)",
};

const PILLAR_LABELS: Record<string, string> = {
  safety:          "Safety",
  hallucination:   "Hallucination",
  bias:            "Bias",
  prompt_security: "Prompt Sec.",
  compliance:      "Compliance",
};

export default function LatencyWaterfall({ timingsMs, totalLatencyMs, perPillarMs, p95BudgetMs }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const total = timingsMs?.total_ms ?? totalLatencyMs ?? 0;
  const budget = p95BudgetMs ?? 500;

  const stages = useMemo(() => {
    if (!total) return [];

    const dispatchMs = timingsMs?.pillar_dispatch_ms;
    const enforceMs  = timingsMs?.enforcement_ms ?? 10;
    const assemblyMs = timingsMs?.response_assembly_ms ?? 5;
    const auditMs    = timingsMs?.audit_enqueue_ms ?? 1;
    const perPillar  = { ...perPillarMs, ...(timingsMs?.per_pillar_ms ?? {}) };

    // Build stage list
    const result: { label: string; startMs: number; durationMs: number; color: string; track: number }[] = [];

    let cursor = 0;

    // Setup (auth + parsing) — if no timing, estimate 15ms
    const setupMs = total - (dispatchMs ?? 0) - enforceMs - assemblyMs;
    const setupEst = Math.max(5, Math.min(setupMs, 20));
    result.push({ label: "Setup", startMs: cursor, durationMs: setupEst, color: STAGE_COLORS.setup, track: 0 });
    cursor += setupEst;

    // Pillar dispatch (parallel)
    const pillarStart = cursor;
    const pillarKeys  = Object.keys(perPillar);
    const maxPillarMs = pillarKeys.length > 0
      ? Math.max(...Object.values(perPillar).filter(Boolean).map(Number))
      : dispatchMs ?? 200;

    pillarKeys.forEach((p, i) => {
      const ms = perPillar[p] ?? maxPillarMs;
      result.push({
        label:      PILLAR_LABELS[p] ?? p,
        startMs:    pillarStart,
        durationMs: ms,
        color:      STAGE_COLORS[p] ?? "#7C3AED",
        track:      i + 1,
      });
    });

    cursor = pillarStart + maxPillarMs;

    // Enforcement decision
    result.push({ label: "Enforcement", startMs: cursor, durationMs: enforceMs, color: STAGE_COLORS.enforcement, track: 0 });
    cursor += enforceMs;

    // Response assembly
    result.push({ label: "Response", startMs: cursor, durationMs: assemblyMs, color: STAGE_COLORS.response, track: 0 });
    cursor += assemblyMs;

    // Audit enqueue (background track)
    result.push({ label: "Audit (bg)", startMs: cursor, durationMs: auditMs, color: STAGE_COLORS.audit, track: pillarKeys.length + 1 });

    return result;
  }, [timingsMs, totalLatencyMs, perPillarMs, total]);

  if (!total || stages.length === 0) {
    return (
      <div style={{
        padding: "28px",
        textAlign: "center",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 12,
        color: "rgba(240,242,255,0.2)",
      }}>
        Latency waterfall available after first evaluation with debug timing.
      </div>
    );
  }

  const W = 560;
  const trackH = 22;
  const trackGap = 4;
  const maxTracks = Math.max(...stages.map(s => s.track)) + 1;
  const H = maxTracks * (trackH + trackGap) + 40;
  const labelW = 80;
  const chartW = W - labelW;
  const scale = (ms: number) => (ms / Math.max(total, budget)) * chartW;
  const budgetX = scale(budget);

  return (
    <div ref={ref}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible", maxWidth: W }}
      >
        {/* P95 budget line */}
        <line
          x1={labelW + budgetX} y1={0}
          x2={labelW + budgetX} y2={H - 30}
          stroke="#F43F5E"
          strokeWidth={1}
          strokeDasharray="4 3"
          strokeOpacity={0.5}
        />
        <text
          x={labelW + budgetX + 4} y={10}
          fontFamily="JetBrains Mono, monospace"
          fontSize={8}
          fill="#F43F5E"
          fillOpacity={0.6}
        >
          p95 budget
        </text>

        {/* Stage bars */}
        {stages.map((s, i) => {
          const y      = s.track * (trackH + trackGap);
          const x      = labelW + scale(s.startMs);
          const barW   = Math.max(2, scale(s.durationMs));
          const isAudit = s.label.includes("bg");

          return (
            <g key={i}>
              {/* Track label */}
              <text
                x={labelW - 4} y={y + trackH / 2 + 4}
                textAnchor="end"
                fontFamily="DM Sans, sans-serif"
                fontSize={9}
                fill="rgba(240,242,255,0.35)"
              >
                {s.label}
              </text>

              {/* Bar */}
              <rect
                x={x}
                y={y + (isAudit ? 4 : 2)}
                width={visible ? barW : 0}
                height={isAudit ? trackH - 8 : trackH - 4}
                rx={3}
                fill={s.color}
                fillOpacity={isAudit ? 0.3 : 0.7}
                style={{ transition: `width 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms` }}
              />

              {/* Duration label */}
              {barW > 30 && (
                <text
                  x={x + barW / 2}
                  y={y + trackH / 2 + 4}
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize={8}
                  fill="rgba(240,242,255,0.7)"
                >
                  {s.durationMs}ms
                </text>
              )}
            </g>
          );
        })}

        {/* Time axis */}
        <line x1={labelW} y1={H - 20} x2={W} y2={H - 20} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {[0, 0.25, 0.5, 0.75, 1.0].map((pct) => {
          const ms  = Math.round(total * pct);
          const x   = labelW + pct * chartW;
          return (
            <g key={pct}>
              <line x1={x} y1={H - 24} x2={x} y2={H - 18} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              <text x={x} y={H - 6} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="rgba(240,242,255,0.25)">
                {ms}ms
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
