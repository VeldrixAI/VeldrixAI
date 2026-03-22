"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { Footer } from "./footer";

type User = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error("Unauthorized");
        const userData = await res.json();
        setUser(userData);
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
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="stars"></div>
        <div className="loading-screen">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="dashboard-container">
      <div className="stars"></div>
      <div className="dashboard-border-glow"></div>
      
      <header className="dashboard-header">
        <div className="shell">
          <div className="dashboard-nav-wrapper">
            <BrandLogo href="/dashboard" />
            
            <nav className="dashboard-nav">
              <Link 
                href="/dashboard" 
                className={pathname === "/dashboard" ? "active" : ""}
              >
                Dashboard
              </Link>
              <Link 
                href="/dashboard/api-keys" 
                className={pathname === "/dashboard/api-keys" ? "active" : ""}
              >
                API Keys
              </Link>
              <Link 
                href="/dashboard/profile" 
                className={pathname === "/dashboard/profile" ? "active" : ""}
              >
                Profile
              </Link>
            </nav>

            <div className="dashboard-user-section">
              <div className="user-info">
                <span className="user-email">{user.email}</span>
                <span className="user-role">{user.role}</span>
              </div>
              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {children}
      </main>

      <Footer />
    </div>
  );
}
