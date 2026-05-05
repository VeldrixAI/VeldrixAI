"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface TrustScoreMeterProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function TrustScoreMeter({
  score,
  size = 120,
  strokeWidth = 8,
  className = "",
}: TrustScoreMeterProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI * 1.5;
  const progress = (score / 100) * circumference;

  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#F43F5E";

  return (
    <div ref={ref} className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(150deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference * 4}`}
          strokeLinecap="round"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference * 4}`}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={inView ? { strokeDashoffset: circumference - progress } : {}}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl text-cyan">{score}</span>
        <span className="font-body text-[10px] text-snow/30 tracking-wider uppercase">Trust</span>
      </div>
    </div>
  );
}
