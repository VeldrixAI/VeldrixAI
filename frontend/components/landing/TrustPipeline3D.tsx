"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PIPELINE_STAGES = [
  { id: "input", label: "INPUT", sublabel: "raw prompt" },
  { id: "safety", label: "SAFETY", sublabel: "toxicity scan" },
  { id: "hallucination", label: "HALLUCINATION", sublabel: "grounding" },
  { id: "bias", label: "BIAS", sublabel: "fairness" },
  { id: "security", label: "SECURITY", sublabel: "injection" },
  { id: "output", label: "OUTPUT", sublabel: "signed" },
];

interface DataPacket {
  id: number;
  stage: number;
  progress: number;
}

export function TrustPipeline3D({ reduced = false }: { reduced?: boolean }) {
  const [packets, setPackets] = useState<DataPacket[]>([]);
  const [activeStage, setActiveStage] = useState(0);
  const [latency, setLatency] = useState(147);
  const [trust, setTrust] = useState(92);
  const [sha, setSha] = useState("4a7f");
  const packetIdRef = useRef(0);
  const isClient = useRef(false);

  useEffect(() => {
    isClient.current = true;
    
    if (reduced) return;

    const spawnInterval = setInterval(() => {
      const id = ++packetIdRef.current;
      setPackets((prev) => [...prev.slice(-5), { id, stage: 0, progress: 0 }]);
    }, 2500);

    const animateInterval = setInterval(() => {
      setPackets((prev) =>
        prev
          .map((p) => {
            const newProgress = p.progress + 4;
            const newStage = Math.floor(newProgress / 16);
            return { ...p, progress: newProgress, stage: newStage };
          })
          .filter((p) => p.progress < 100)
      );
      setActiveStage((prev) => (prev + 1) % 6);
    }, 80);

    const metricsInterval = setInterval(() => {
      setLatency(Math.floor(140 + Math.random() * 80));
      setTrust(Math.floor(85 + Math.random() * 12));
      setSha(Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
    }, 500);

    return () => {
      clearInterval(spawnInterval);
      clearInterval(animateInterval);
      clearInterval(metricsInterval);
    };
  }, [reduced]);

  return (
    <div className="vdx-pipeline-container">
      <div className="vdx-pipeline-header">
        <span className="vdx-mono-label">TRUST PIPELINE ORCHESTRATION</span>
        <span className="vdx-mono-value">{reduced ? "STATIC" : "LIVE"}</span>
      </div>

      <div className="vdx-pipeline-visual">
        <svg width="100%" height="280" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="stageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(45,74,94,0.15)" />
              <stop offset="100%" stopColor="rgba(170,184,192,0.15)" />
            </linearGradient>
            <filter id="pipelineGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {PIPELINE_STAGES.slice(0, -1).map((_, i) => (
            <line
              key={i}
              x1={50 + i * 60 + 25}
              y1={140}
              x2={50 + (i + 1) * 60 - 5}
              y2={140}
              stroke="rgba(45,74,94,0.3)"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="vdx-flow-line"
            />
          ))}

          {PIPELINE_STAGES.map((stage, i) => (
            <g key={stage.id}>
              <rect
                x={50 + i * 60}
                y={100}
                width="50"
                height="80"
                rx="6"
                fill="url(#stageGrad)"
                stroke={activeStage === i ? "rgba(45,74,94,0.8)" : "rgba(255,255,255,0.08)"}
                strokeWidth={activeStage === i ? "1.5" : "0.5"}
              />
              <text
                x={50 + i * 60 + 25}
                y={85}
                fontSize="8"
                fill={activeStage === i ? "rgba(197,207,213,0.9)" : "rgba(255,255,255,0.35)"}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {stage.label}
              </text>
              <text
                x={50 + i * 60 + 25}
                y={195}
                fontSize="6"
                fill="rgba(255,255,255,0.25)"
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
              >
                {stage.sublabel}
              </text>
            </g>
          ))}

          <AnimatePresence>
            {!reduced && packets.map((packet) => (
              <motion.rect
                key={packet.id}
                x={50 + (packet.progress / 100) * 300}
                y={140 + Math.sin(packet.progress * 0.1) * 10 - 6}
                width="12"
                height="12"
                rx="3"
                fill={packet.stage >= 5 ? "#aab8c0" : "#2d4a5e"}
                filter="url(#pipelineGlow)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ stiffness: 300, damping: 30 }}
              />
            ))}
          </AnimatePresence>
        </svg>
      </div>

      <div className="vdx-pipeline-metrics">
        <div className="vdx-metric-item">
          <span className="vdx-metric-label">LATENCY</span>
          <span className="vdx-metric-value">{latency}ms</span>
        </div>
        <div className="vdx-metric-item">
          <span className="vdx-metric-label">TRUST</span>
          <span className="vdx-metric-value">{trust}%</span>
        </div>
        <div className="vdx-metric-item vdx-metric-sha">
          <span className="vdx-metric-label">SHA256</span>
          <span className="vdx-metric-value">{sha}...</span>
        </div>
      </div>
    </div>
  );
}
