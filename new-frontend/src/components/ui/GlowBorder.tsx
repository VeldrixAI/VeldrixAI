"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowBorderProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export default function GlowBorder({
  children,
  className = "",
  glowColor = "rgba(124,58,237,0.3)",
}: GlowBorderProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "relative rounded-[14px] border border-white/7 bg-white/[0.02] p-8 transition-all duration-300 hover:border-violet/30",
        className
      )}
      style={{
        ["--glow-color" as string]: glowColor,
      }}
    >
      {children}
    </motion.div>
  );
}
