"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import FadeUp from "@/components/animations/FadeUp";

const flowNodes = [
  { id: "agent",   label: "Agent",                              x: 40,  y: 20,  width: 100, color: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  { id: "tool",    label: "Tool Call\nDELETE /users/all",       x: 200, y: 20,  width: 160, color: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
  { id: "guard",   label: "VeldrixAI Guard",                    x: 200, y: 120, width: 160, color: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.25)" },
  { id: "policy",  label: "Policy Check\nFAIL",                 x: 200, y: 220, width: 160, color: "rgba(244,63,94,0.06)",  border: "rgba(244,63,94,0.2)" },
  { id: "blocked", label: "BLOCKED",                            x: 80,  y: 320, width: 100, color: "rgba(244,63,94,0.12)", border: "#F43F5E" },
  { id: "audit",   label: "Audit Log\nCreated",                 x: 280, y: 320, width: 110, color: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.3)" },
];

function FlowDiagram() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const arrows = [
    { x1: 140, y1: 42, x2: 200, y2: 42, delay: 0.3 },
    { x1: 280, y1: 68, x2: 280, y2: 120, delay: 0.5 },
    { x1: 280, y1: 168, x2: 280, y2: 220, delay: 0.7 },
    { x1: 200, y1: 342, x2: 180, y2: 342, delay: 0.9 },
    { x1: 360, y1: 342, x2: 390, y2: 342, delay: 1.0 },
  ];

  return (
    <div ref={ref} className="relative w-full max-w-[480px] h-[420px]">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 420">
        {/* Arrows */}
        {arrows.map((arrow, i) => (
          <g key={i}>
            <motion.line
              x1={arrow.x1} y1={arrow.y1}
              x2={arrow.x2} y2={arrow.y2}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="4 2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={inView ? { pathLength: 1, opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: arrow.delay }}
            />
          </g>
        ))}

        {/* Nodes */}
        {flowNodes.map((node, i) => (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.4, delay: i * 0.12 }}
          >
            <rect
              x={node.x} y={node.y}
              width={node.width} height={42}
              rx="8"
              fill={node.color}
              stroke={node.border}
              strokeWidth="1"
            />
            {node.label.split("\n").map((line, li) => (
              <text
                key={li}
                x={node.x + node.width / 2}
                y={node.y + (node.label.includes("\n") ? 17 + li * 14 : 25)}
                textAnchor="middle"
                fill={node.id === "blocked" ? "#F43F5E" : node.id === "audit" ? "#10B981" : "rgba(240,242,255,0.7)"}
                fontSize={node.id === "blocked" ? "12" : "11"}
                fontFamily="var(--font-jet), monospace"
                fontWeight={node.id === "blocked" ? "600" : "400"}
              >
                {line}
              </text>
            ))}
          </motion.g>
        ))}

        {/* Pulsing BLOCKED */}
        <motion.circle
          cx={130} cy={341}
          r={28}
          fill="none"
          stroke="#F43F5E"
          strokeWidth="1"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={inView ? { opacity: [0, 0.3, 0], scale: [0.8, 1.4, 1.8] } : {}}
          transition={{ repeat: Infinity, duration: 2, delay: 1.2 }}
        />
      </svg>
    </div>
  );
}

export default function AgentGuard() {
  return (
    <section className="py-24 md:py-28 px-6" id="agent-guard">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          {/* Left text */}
          <div className="flex-1 max-w-lg">
            <FadeUp>
              <p className="font-body text-[10px] tracking-[4px] uppercase text-snow/30 mb-4">
                Agent Runtime
              </p>
              <h2
                className="font-display font-bold text-white tracking-[-1.5px] mb-5"
                style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
              >
                Agent Runtime Guard
              </h2>
              <p
                className="font-body font-medium text-[18px] mb-4"
                style={{ color: "rgba(240,242,255,0.8)" }}
              >
                Stop unsafe autonomous actions before they execute.
              </p>
              <p className="font-body font-light text-[16px] text-snow/50 leading-[1.8] mb-6">
                VeldrixAI intercepts tool calls, API requests, and database writes from
                LangChain, CrewAI, and AutoGen agents — before they cause irreversible harm.
              </p>

              <div className="flex flex-col gap-3">
                {[
                  "Intercepts tool calls before execution",
                  "Evaluates against your policy definitions",
                  "Blocks, flags, or escalates in real time",
                  "Full audit trail for every agent action",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="text-snow/20 mt-[2px] shrink-0">·</span>
                    <span className="font-body text-[15px] text-snow/60 leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>

          {/* Right diagram */}
          <div className="flex-1 flex justify-center">
            <FlowDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
