"use client";
import { useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import VeldrixMark from "@/components/ui/VeldrixMark";

const navLinks = [
  { label: "Platform", href: "#" },
  { label: "Agent Guard", href: "#agent-guard" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#" },
];

export default function Navbar() {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(true);
  const [lastY, setLastY] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 20);
    if (latest < 100 || latest < lastY) {
      setVisible(true);
    } else {
      setVisible(false);
      setMobileOpen(false);
    }
    setLastY(latest);
  });

  return (
    <>
      <motion.nav
        animate={{ y: visible ? 0 : -80 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="fixed top-0 left-0 right-0 z-50 h-16"
        style={{
          backgroundColor: scrolled ? "rgba(5,8,16,0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
          transition: "background-color 0.3s, backdrop-filter 0.3s, border-bottom 0.3s",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5">
            <VeldrixMark size={28} />
            <span className="font-display font-bold text-[17px] tracking-[-0.3px]">
              <span className="text-white">Veldrix</span>
              <span className="text-cyan">AI</span>
            </span>
          </a>

          {/* Center nav */}
          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="font-body text-[14px] text-snow/60 hover:text-snow/100 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="#"
              className="font-body text-[14px] text-snow/60 hover:text-snow/100 transition-colors duration-200 px-3 py-2"
            >
              Sign in
            </a>
            <motion.a
              href="#"
              whileTap={{ scale: 0.97 }}
              className="font-display font-semibold text-[13px] bg-violet text-white px-4 py-2 rounded-lg hover:bg-indigo transition-colors duration-200"
            >
              Get API Key
            </motion.a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-snow/60 hover:text-snow/100 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-void/95 backdrop-blur-xl flex flex-col pt-20 px-8 md:hidden"
          >
            {navLinks.map((link, i) => (
              <motion.a
                key={link.label}
                href={link.href}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setMobileOpen(false)}
                className="font-display font-semibold text-2xl text-snow/80 hover:text-white py-4 border-b border-white/6 transition-colors"
              >
                {link.label}
              </motion.a>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-8 flex flex-col gap-3"
            >
              <a href="#" className="font-body text-snow/60 text-center py-3">Sign in</a>
              <a href="#" className="font-display font-semibold bg-violet text-white text-center py-3 rounded-lg">
                Get API Key
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
