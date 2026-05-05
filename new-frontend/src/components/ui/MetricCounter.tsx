"use client";
import { useEffect, useRef } from "react";
import { useInView, animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface MetricCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  label: string;
  className?: string;
}

export default function MetricCounter({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  label,
  className = "",
}: MetricCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const containerRef = useRef(null);
  const inView = useInView(containerRef, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 2,
      ease: "easeOut",
      onUpdate(v) {
        if (ref.current) {
          ref.current.textContent = prefix + v.toFixed(decimals) + suffix;
        }
      },
    });
    return () => controls.stop();
  }, [inView, value, suffix, prefix, decimals]);

  return (
    <div ref={containerRef} className={cn("flex flex-col items-center gap-2", className)}>
      <span
        ref={ref}
        className="font-mono text-cyan"
        style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 1 }}
      >
        {prefix}0{suffix}
      </span>
      <span className="font-body text-[13px] tracking-[3px] uppercase text-snow/40">
        {label}
      </span>
    </div>
  );
}
