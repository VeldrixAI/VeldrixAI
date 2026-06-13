"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PricingCard, { PLANS, type PricingPlan } from "@/components/billing/PricingCard";
import { AUTH_COOKIE } from "@/lib/config";
import { ShieldMark } from "@/components/shield-mark";

function BillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
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

  const handlePlanSelect = (plan: PricingPlan) => {
    if (plan.id === "free") {
      router.push("/signup");
      return;
    }
    if (plan.id === "enterprise") {
      window.location.href = "mailto:sales@veldrixai.ca?subject=Enterprise+Inquiry";
      return;
    }
    const hasCookie =
      document.cookie.includes(AUTH_COOKIE) ||
      document.cookie.includes("aegis_session");
    if (!hasCookie) {
      router.push(`/login?redirect=${encodeURIComponent(`/dashboard/billing/checkout?plan=${plan.id}&cycle=${cycle}`)}`);
      return;
    }
    router.push(`/dashboard/billing/checkout?plan=${plan.id}&cycle=${cycle}`);
  };

  const highlightedPlan = planParam || null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a1014",
        color: "#e7ecef",
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
            background: "rgba(45,74,94,0.95)",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "10px",
            fontSize: "14px",
            cursor: "pointer",
            zIndex: 999,
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(45,74,94,0.3)",
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
          background: "rgba(10,16,20,0.8)",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}
        >
          <ShieldMark size={32} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "18px", color: "#fff" }}>
            Veldrix
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
              transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
            }}
          >
            Sign In
          </a>
          <a
            href="/signup"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #2d4a5e, #243b4c)",
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
        <p style={{ fontSize: "18px", color: "rgba(231,236,239,0.55)", margin: 0 }}>
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
              background: cycle === "monthly" ? "rgba(45,74,94,0.5)" : "transparent",
              color: cycle === "monthly" ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
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
              background: cycle === "annual" ? "rgba(45,74,94,0.5)" : "transparent",
              color: cycle === "annual" ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Annual
            <span
              style={{
                fontSize: "11px",
                background: "rgba(170,184,192,0.2)",
                color: "#aab8c0",
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
              outline: highlightedPlan === plan.id ? "2px solid rgba(45,74,94,0.8)" : "none",
              borderRadius: "18px",
              transition: "outline 0.2s",
            }}
          >
            <PricingCard
              plan={plan}
              cycle={cycle}
              onSelect={handlePlanSelect}
              loading={false}
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
        <p style={{ fontSize: "14px", color: "rgba(231,236,239,0.35)" }}>
          All plans include a 14-day free trial. No credit card required for Free tier.{" "}
          <a href="/contact" style={{ color: "#2d4a5e", textDecoration: "none" }}>
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
