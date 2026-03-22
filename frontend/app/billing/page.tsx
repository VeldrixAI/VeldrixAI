"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PricingCard, { PLANS, type PricingPlan } from "@/components/billing/PricingCard";
import { AUTH_API_URL, AUTH_COOKIE } from "@/lib/config";

function BillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Read query params for pre-selected plan and auto-trigger
  const planParam = searchParams.get("plan");
  const cycleParam = searchParams.get("cycle") as "monthly" | "annual" | null;
  const autostart = searchParams.get("autostart") === "true";

  useEffect(() => {
    if (cycleParam === "annual" || cycleParam === "monthly") {
      setCycle(cycleParam);
    }
  }, [cycleParam]);

  // Auto-trigger checkout after login redirect if ?autostart=true and user is authenticated
  useEffect(() => {
    if (!autostart || !planParam) return;

    const hasCookie =
      document.cookie.includes(AUTH_COOKIE) ||
      document.cookie.includes("aegis_session");

    if (!hasCookie) return;

    const target = PLANS.find((p) => p.id === planParam);
    if (target && target.id !== "free" && target.id !== "enterprise") {
      handlePlanSelect(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, planParam]);

  const handlePlanSelect = async (plan: PricingPlan) => {
    if (plan.id === "free") {
      router.push("/signup");
      return;
    }
    if (plan.id === "enterprise") {
      window.location.href = "mailto:sales@veldrix.ai?subject=Enterprise+Inquiry";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${AUTH_API_URL}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: plan.id, cycle }),
      });

      if (res.status === 401) {
        const returnUrl = `/billing?plan=${plan.id}&cycle=${cycle}&autostart=true`;
        router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setToast((err as { detail?: string }).detail || "Failed to start checkout. Please try again.");
        return;
      }

      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch {
      setToast("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const highlightedPlan = planParam || null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050810",
        color: "#f0f2ff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: "rgba(124,58,237,0.95)",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "10px",
            fontSize: "14px",
            cursor: "pointer",
            zIndex: 999,
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(124,58,237,0.3)",
          }}
        >
          {toast} ×
        </div>
      )}

      {/* Navbar */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(5,8,16,0.8)",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}
        >
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
            <defs>
              <linearGradient id="vg2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
              <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#bg2)" stroke="#7c3aed" strokeWidth="1" strokeOpacity="0.4" />
            <path d="M24 30 L50 70 L76 30" fill="none" stroke="url(#vg2)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="70" r="5" fill="#06b6d4" />
            <circle cx="50" cy="70" r="2.5" fill="white" />
            <rect x="30" y="47" width="12" height="2.5" rx="1.25" fill="#a78bfa" opacity="0.6" />
            <rect x="58" y="47" width="12" height="2.5" rx="1.25" fill="#67e8f9" opacity="0.6" />
          </svg>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "18px", color: "#fff" }}>
            VeldrixAI
          </span>
        </a>
        <div style={{ display: "flex", gap: "12px" }}>
          <a
            href="/login"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "14px",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Sign In
          </a>
          <a
            href="/signup"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "#fff",
              fontSize: "14px",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Start Free
          </a>
        </div>
      </nav>

      {/* Page header */}
      <div style={{ textAlign: "center", padding: "64px 24px 40px" }}>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(36px, 5vw, 54px)",
            fontWeight: 800,
            color: "#fff",
            margin: "0 0 16px",
            lineHeight: 1.1,
          }}
        >
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: "18px", color: "rgba(240,242,255,0.55)", margin: 0 }}>
          Start free. Scale as you grow. Cancel anytime.
        </p>

        {/* Billing cycle toggle */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "32px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "40px",
            padding: "6px 16px",
          }}
        >
          <button
            onClick={() => setCycle("monthly")}
            style={{
              padding: "6px 16px",
              borderRadius: "20px",
              border: "none",
              background: cycle === "monthly" ? "rgba(124,58,237,0.5)" : "transparent",
              color: cycle === "monthly" ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle("annual")}
            style={{
              padding: "6px 16px",
              borderRadius: "20px",
              border: "none",
              background: cycle === "annual" ? "rgba(124,58,237,0.5)" : "transparent",
              color: cycle === "annual" ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Annual
            <span
              style={{
                fontSize: "11px",
                background: "rgba(6,182,212,0.2)",
                color: "#06b6d4",
                padding: "2px 6px",
                borderRadius: "20px",
                fontWeight: 600,
              }}
            >
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing cards */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "0 24px 80px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}
      >
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            style={{
              outline: highlightedPlan === plan.id ? "2px solid rgba(124,58,237,0.8)" : "none",
              borderRadius: "18px",
              transition: "outline 0.2s",
            }}
          >
            <PricingCard
              plan={plan}
              cycle={cycle}
              onSelect={handlePlanSelect}
              loading={loading}
            />
          </div>
        ))}
      </div>

      {/* FAQ strip */}
      <div
        style={{
          maxWidth: "700px",
          margin: "0 auto",
          padding: "0 24px 80px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "14px", color: "rgba(240,242,255,0.35)" }}>
          All plans include a 14-day free trial. No credit card required for Free tier.{" "}
          <a href="/contact" style={{ color: "#7c3aed", textDecoration: "none" }}>
            Questions? Talk to sales →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingPageInner />
    </Suspense>
  );
}
