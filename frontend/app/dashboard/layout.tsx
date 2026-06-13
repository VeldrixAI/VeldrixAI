"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ShieldMark } from "@/components/shield-mark";
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
const VMark = () => <ShieldMark size={26} />;

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
  { href: "/dashboard/support", label: "Support",  icon: <IcoHelp /> },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          // 5xx or network hiccup — retry once after 1.5s before giving up
          await new Promise((r) => setTimeout(r, 1500));
          const retry = await fetch("/api/auth/me");
          if (!retry.ok) {
            if (retry.status === 401) router.push("/login");
            setLoading(false);
            return;
          }
          setUser(await retry.json());
        } else {
          setUser(await res.json());
        }
      } catch {
        // pure network failure — don't kick the user out, just stop loading
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a1014", flexDirection: "column", gap: "16px" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "50%",
          border: "2px solid rgba(45,74,94,0.2)",
          borderTopColor: "#2d4a5e",
          animation: "spin 0.9s linear infinite",
        }}/>
        <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(231,236,239,0.4)", letterSpacing: "2px", textTransform: "uppercase" }}>Loading Veldrix</p>
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
    color: active ? "#e7ecef" : "rgba(231,236,239,0.45)",
    background: active ? "rgba(45,74,94,0.12)" : "transparent",
    borderLeft: active ? "3px solid #2d4a5e" : "3px solid transparent",
    transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
    position: "relative",
    textDecoration: "none",
    cursor: "pointer",
  });

  return (
    <div className="vx-app-shell">
      {/* ── Mobile overlay (rendered when sidebar is open on mobile) ── */}
      {mobileNavOpen && (
        <div
          className="vx-mobile-overlay"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`vx-app-sidebar${mobileNavOpen ? " mobile-open" : ""}`}>
        {/* Brand */}
        <div style={{ padding: "28px 20px 20px" }}>
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, rgba(45,74,94,0.3), rgba(170,184,192,0.2))",
              border: "1px solid rgba(45,74,94,0.35)",
              boxShadow: "0 4px 16px rgba(45,74,94,0.25)",
              flexShrink: 0,
            }}>
              <VMark />
            </div>
            <div>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "19px", letterSpacing: "-0.4px", color: "white", lineHeight: 1 }}>
                Veldrix
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "rgba(231,236,239,0.35)", marginTop: "2px" }}>
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
            background: "linear-gradient(135deg, #8fa6b5 0%, #2d4a5e 50%, #243b4c 100%)",
            color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "13px",
            textDecoration: "none", boxShadow: "0 4px 20px rgba(45,74,94,0.3)",
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
                color: "rgba(231,236,239,0.2)", padding: "12px 20px 6px",
              }}>
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} style={navItemStyle(active)}>
                    <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0, color: active ? "#c5cfd5" : "currentColor" }}>{item.icon}</span>
                    {item.label}
                    {active && <span style={{
                      position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                      width: "3px", height: "60%", borderRadius: "2px 0 0 2px",
                      background: "linear-gradient(to bottom, #2d4a5e, #243b4c)",
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
            color: "rgba(231,236,239,0.2)", padding: "8px 20px 6px",
          }}>
            SECONDARY
          </div>
          {secondaryItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={navItemStyle(active)}>
                <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0, color: active ? "#c5cfd5" : "currentColor" }}>{item.icon}</span>
                {item.label}
                {active && <span style={{
                  position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                  width: "3px", height: "60%", borderRadius: "2px 0 0 2px",
                  background: "linear-gradient(to bottom, #2d4a5e, #243b4c)",
                }}/>}
              </Link>
            );
          })}
        </nav>

        {/* User profile chip */}
        <div style={{ padding: "8px 12px" }}>
          <div style={{ padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "linear-gradient(135deg, #2d4a5e, #243b4c)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "11px",
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#e7ecef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {displayName}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px", color: "rgba(231,236,239,0.3)" }}>
                {user.role}
              </div>
            </div>
            <button onClick={logout} title="Sign out" style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(231,236,239,0.3)", padding: "4px", borderRadius: "6px",
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
          {/* Mobile hamburger — CSS hides this above 768px */}
          <button
            className="vx-mobile-menu-btn"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Search — CSS hides this on mobile */}
          <div className="vx-topbar-search-area" style={{ position: "relative", width: "100%", maxWidth: "400px" }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(231,236,239,0.3)", pointerEvents: "none" }}>
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
                border: `1px solid ${searchFocused ? "rgba(45,74,94,0.4)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: "100px",
                padding: "8px 16px 8px 40px",
                color: "#e7ecef",
                fontFamily: "DM Sans, sans-serif",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
            />
          </div>

          {/* Actions + user */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <NotificationBell userId={user.id} />
            <TopbarIconBtn title="Audit history" onClick={() => router.push("/dashboard/audit-trails")}><IcoDoc /></TopbarIconBtn>

            <div style={{ width: "1px", height: "28px", background: "rgba(255,255,255,0.08)" }}/>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* User name/role text — CSS hides on mobile, keeping only avatar */}
              <div className="vx-topbar-user-text" style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "12px", color: "#e7ecef", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {displayName}
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(231,236,239,0.35)" }}>
                  {user.role}
                </div>
              </div>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: "linear-gradient(135deg, #2d4a5e, #243b4c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "12px",
                border: "1px solid rgba(45,74,94,0.3)",
              }}>
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="vx-app-main page-transition">
          {children}
        </main>

        {/* Footer */}
        <footer className="vx-app-footer">
          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(231,236,239,0.2)", letterSpacing: "1px" }}>
            © 2026 Veldrix · Runtime Trust Infrastructure · AES-256 Encrypted
          </span>
          <div style={{ display: "flex", gap: "20px" }}>
            {["Privacy Policy", "Terms of Service", "Security Audit"].map((l) => (
              <a key={l} href="#" onClick={(e) => e.preventDefault()} style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(231,236,239,0.25)", transition: "color 0.2s", textDecoration: "none" }}>
                {l}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function TopbarIconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding: "8px", borderRadius: "50%", background: hov ? "rgba(255,255,255,0.06)" : "none",
        border: "none", cursor: "pointer", color: "rgba(231,236,239,0.6)", transition: "background 0.2s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}
