import VeldrixMark from "@/components/ui/VeldrixMark";

const platformLinks = [
  { label: "Platform", href: "#" },
  { label: "Docs", href: "#" },
  { label: "Pricing", href: "#pricing" },
  { label: "Status", href: "#" },
  { label: "GitHub", href: "#" },
];

const legalLinks = [
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Security", href: "#" },
  { label: "Contact", href: "#" },
];

export default function Footer() {
  return (
    <footer
      className="border-t px-6 py-12"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-10">
        {/* Brand */}
        <div className="flex flex-col gap-3 max-w-[220px]">
          <a href="#" className="flex items-center gap-2">
            <VeldrixMark size={22} />
            <span className="font-display font-bold text-[15px]">
              <span className="text-white">Veldrix</span>
              <span className="text-cyan">AI</span>
            </span>
          </a>
          <p className="font-body text-[13px] text-snow/30 leading-relaxed">
            Runtime trust infrastructure for AI systems.
          </p>
          <p className="font-body text-[12px] text-snow/20 mt-2">
            © {new Date().getFullYear()} VeldrixAI, Inc.
          </p>
        </div>

        {/* Platform links */}
        <div className="flex flex-col gap-3">
          <p className="font-body text-[11px] tracking-[3px] uppercase text-snow/30 mb-1">
            Product
          </p>
          {platformLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-body text-[13px] text-snow/30 hover:text-snow/80 transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Legal links */}
        <div className="flex flex-col gap-3">
          <p className="font-body text-[11px] tracking-[3px] uppercase text-snow/30 mb-1">
            Legal
          </p>
          {legalLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-body text-[13px] text-snow/30 hover:text-snow/80 transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
