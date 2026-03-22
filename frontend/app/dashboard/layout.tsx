"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import "./veldrix-tokens.css";

type User = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
};

/* ── Inline SVG icons ── */
const IcoGrid = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IcoChart = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
  </svg>
);
const IcoShield = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);
const IcoLayers = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
);
const IcoTerminal = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
);
const IcoKey = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);
const IcoCode = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IcoCreditCard = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const IcoGear = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IcoHelp = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IcoDoc = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IcoLogout = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IcoSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

/* ── Brand V Mark ── */
const VMark = ({ sfx }: { sfx: string }) => (
  <svg width="26" height="26" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={`vg1-${sfx}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c4b5fd"/>
        <stop offset="50%" stopColor="#818cf8"/>
        <stop offset="100%" stopColor="#67e8f9"/>
      </linearGradient>
      <linearGradient id={`vg2-${sfx}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
        <stop offset="100%" stopColor="#a78bfa"/>
      </linearGradient>
      <linearGradient id={`sq-${sfx}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4"/>
        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2"/>
      </linearGradient>
      <filter id={`fg-${sfx}`}>
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id={`fg2-${sfx}`}>
        <feGaussianBlur stdDeviation="1.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="8" y="8" width="84" height="84" rx="18" fill={`url(#sq-${sfx})`} stroke={`url(#vg1-${sfx})`} strokeWidth="1"/>
    <path d="M50 18 L82 50 L50 82 L18 50 Z" fill="none" stroke={`url(#vg1-${sfx})`} strokeWidth="0.8" strokeOpacity="0.3"/>
    <path d="M24 30 L50 70 L76 30" fill="none" stroke={`url(#vg2-${sfx})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter={`url(#fg-${sfx})`}/>
    <circle cx="50" cy="70" r="5" fill={`url(#vg1-${sfx})`} filter={`url(#fg2-${sfx})`}/>
    <circle cx="50" cy="70" r="2.5" fill="white" opacity="0.9"/>
    <rect x="30" y="47" width="14" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.6"/>
    <rect x="56" y="47" width="14" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.6"/>
    <line x1="50" y1="8" x2="50" y2="16" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
  </svg>
);

const navSections = [
  {
    label: "MONITOR",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <IcoGrid /> },
      { href: "/dashboard/reports", label: "Trust Reports", icon: <IcoChart /> },
      { href: "/dashboard/audit-trails", label: "Audit Logs", icon: <IcoShield /> },
    ],
  },
  {
    label: "EVALUATION",
    items: [
      { href: "/dashboard/evaluate", label: "Trust Evaluation", icon: <IcoLayers /> },
      { href: "/dashboard/prompt-generator", label: "Prompt Architect", icon: <IcoTerminal /> },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { href: "/dashboard/api-keys", label: "API Keys", icon: <IcoKey /> },
      { href: "/dashboard/sdk", label: "SDK", icon: <IcoCode /> },
      { href: "/dashboard/billing", label: "Billing", icon: <IcoCreditCard /> },
    ],
  },
];

const secondaryItems = [
  { href: "/dashboard/profile", label: "Settings", icon: <IcoGear /> },
  { href: "#support", label: "Support", icon: <IcoHelp /> },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error("Unauthorized");
        setUser(await res.json());
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#050810", flexDirection: "column", gap: "16px" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "50%",
          border: "2px solid rgba(124,58,237,0.2)",
          borderTopColor: "#7c3aed",
          animation: "spin 0.9s linear infinite",
        }}/>
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.4)", letterSpacing: "2px", textTransform: "uppercase" }}>Loading VeldrixAI</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.email.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: active ? "10px 16px 10px 13px" : "10px 16px",
    margin: "1px 8px",
    borderRadius: active ? "0 12px 12px 0" : "12px",
    fontSize: "13px",
    fontFamily: "DM Sans, sans-serif",
    fontWeight: active ? 600 : 500,
    color: active ? "#f0f2ff" : "rgba(240,242,255,0.45)",
    background: active ? "rgba(124,58,237,0.12)" : "transparent",
    borderLeft: active ? "3px solid #7c3aed" : "3px solid transparent",
    transition: "all 0.2s",
    position: "relative",
    textDecoration: "none",
    cursor: "pointer",
  });

  return (
    <div className="vx-app-shell">
      {/* ── Sidebar ── */}
      <aside className="vx-app-sidebar">
        {/* Brand */}
        <div style={{ padding: "28px 20px 20px" }}>
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))",
              border: "1px solid rgba(124,58,237,0.35)",
              boxShadow: "0 4px 16px rgba(124,58,237,0.25)",
              flexShrink: 0,
            }}>
              <VMark sfx="sidebar-shared" />
            </div>
            <div>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "19px", letterSpacing: "-0.4px", color: "white", lineHeight: 1 }}>
                Veldrix<span className="shimmer-text">AI</span>
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginTop: "2px" }}>
                Governance Layer
              </div>
            </div>
          </Link>
        </div>

        {/* New Audit CTA */}
        <div style={{ padding: "0 12px 16px" }}>
          <Link href="/dashboard/audit-trails" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "11px 16px", borderRadius: "12px", width: "100%",
            background: "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)",
            color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "13px",
            textDecoration: "none", boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
            transition: "opacity 0.2s",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
            </svg>
            New Audit
          </Link>
        </div>

        {/* Nav divider */}
        <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: "0 16px 12px" }}/>

        {/* Main nav */}
        <nav style={{ flex: 1, padding: "0 0 8px" }}>
          {navSections.map((section, si) => (
            <div key={section.label}>
              {si > 0 && <div style={{ height: "1px", background: "rgba(255,255,255,0.04)", margin: "8px 16px" }}/>}
              <div style={{
                fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px",
                letterSpacing: "3px", textTransform: "uppercase",
                color: "rgba(240,242,255,0.2)", padding: "12px 20px 6px",
              }}>
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} style={navItemStyle(active)}>
                    <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0, color: active ? "#a78bfa" : "currentColor" }}>{item.icon}</span>
                    {item.label}
                    {active && <span style={{
                      position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                      width: "3px", height: "60%", borderRadius: "2px 0 0 2px",
                      background: "linear-gradient(to bottom, #7c3aed, #4f46e5)",
                    }}/>}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Secondary nav */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.04)", margin: "12px 16px 8px" }}/>
          <div style={{
            fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px",
            letterSpacing: "3px", textTransform: "uppercase",
            color: "rgba(240,242,255,0.2)", padding: "8px 20px 6px",
          }}>
            SECONDARY
          </div>
          {secondaryItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={navItemStyle(active)}
                onClick={item.href === "#support" ? (e) => e.preventDefault() : undefined}>
                <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0, color: active ? "#a78bfa" : "currentColor" }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User profile chip */}
        <div style={{ padding: "8px 12px" }}>
          <div style={{ padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "11px",
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#f0f2ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {displayName}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px", color: "rgba(240,242,255,0.3)" }}>
                {user.role}
              </div>
            </div>
            <button onClick={logout} title="Sign out" style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(240,242,255,0.3)", padding: "4px", borderRadius: "6px",
              transition: "color 0.2s", display: "flex",
            }}>
              <IcoLogout />
            </button>
          </div>
        </div>

        <div style={{ height: "12px" }}/>
      </aside>

      {/* ── Content wrapper ── */}
      <div className="vx-app-content">
        {/* Topbar */}
        <header className="vx-app-topbar">
          {/* Search */}
          <div style={{ position: "relative", width: "100%", maxWidth: "400px" }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(240,242,255,0.3)", pointerEvents: "none" }}>
              <IcoSearch />
            </div>
            <input
              type="text"
              placeholder="Search operational metadata..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${searchFocused ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: "100px",
                padding: "8px 16px 8px 40px",
                color: "#f0f2ff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
          </div>

          {/* Actions + user */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <TopbarIconBtn title="Notifications">
              <div style={{ position: "relative" }}>
                <IcoBell />
                <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "7px", height: "7px", borderRadius: "50%", background: "#f43f5e" }}/>
              </div>
            </TopbarIconBtn>
            <TopbarIconBtn title="Audit history"><IcoDoc /></TopbarIconBtn>

            <div style={{ width: "1px", height: "28px", background: "rgba(255,255,255,0.08)" }}/>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#f0f2ff", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {displayName}
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(240,242,255,0.35)" }}>
                  {user.role}
                </div>
              </div>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "12px",
                border: "1px solid rgba(124,58,237,0.3)",
              }}>
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="vx-app-main page-reveal">
          {children}
        </main>

        {/* Footer */}
        <footer className="vx-app-footer">
          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.2)", letterSpacing: "1px" }}>
            © 2026 VeldrixAI · Runtime Trust Infrastructure · AES-256 Encrypted
          </span>
          <div style={{ display: "flex", gap: "20px" }}>
            {["Privacy Policy", "Terms of Service", "Security Audit"].map((l) => (
              <a key={l} href="#" onClick={(e) => e.preventDefault()} style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.25)", transition: "color 0.2s", textDecoration: "none" }}>
                {l}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function TopbarIconBtn({ children, title }: { children: React.ReactNode; title: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      style={{
        padding: "8px", borderRadius: "50%", background: hov ? "rgba(255,255,255,0.06)" : "none",
        border: "none", cursor: "pointer", color: "rgba(240,242,255,0.6)", transition: "background 0.2s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}
