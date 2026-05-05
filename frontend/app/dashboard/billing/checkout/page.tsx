"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

// ── Types ────────────────────────────────────────────────────────────────────

interface PlanInfo {
  name: string;
  cycle: string;
  amount: number; // cents
}

// ── Plan display helpers ─────────────────────────────────────────────────────

const PLAN_DISPLAY: Record<string, { label: string; quota: string; color: string }> = {
  grow:  { label: "Grow",       quota: "10,000 evals/mo",    color: "#7c3aed" },
  scale: { label: "Scale",      quota: "100,000 evals/mo",   color: "#06b6d4" },
};

const PLAN_FEATURES: Record<string, string[]> = {
  grow: [
    "10,000 API evaluations / month",
    "All 5 trust pillars",
    "Agent Guard (LangChain, CrewAI)",
    "90-day audit retention",
    "Priority support",
  ],
  scale: [
    "100,000 API evaluations / month",
    "All 5 trust pillars + custom logic",
    "Agent Guard (all frameworks)",
    "Unlimited audit retention",
    "Dedicated SLA + 24/7 support",
  ],
};

// ── Inner page (uses searchParams) ───────────────────────────────────────────

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "grow";
  const cycle = searchParams.get("cycle") || "monthly";

  const [clientSecret, setClientSecret] = useState("");
  const [publishableKey, setPubKey] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);

  // Step 1 — create PaymentIntent on mount
  useEffect(() => {
    fetch("/api/billing/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, cycle }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.client_secret) {
          setClientSecret(data.client_secret);
          setPubKey(data.publishable_key);
          setPaymentIntentId(data.payment_intent_id);
          setPlanInfo(data.plan);
        } else {
          setInitError(data.error || "Failed to initialize checkout. Please try again.");
        }
      })
      .catch(() => setInitError("Network error. Please refresh and try again."));
  }, [plan, cycle]);

  // Step 2 — mount Stripe Elements once both CDN script + client_secret are ready
  useEffect(() => {
    if (!stripeReady || !clientSecret || !publishableKey) return;

    const stripe = (window as any).Stripe(publishableKey);
    const elements = stripe.elements({
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#7c3aed",
          colorBackground: "#0d1120",
          colorText: "#f0f2ff",
          colorDanger: "#f43f5e",
          colorTextPlaceholder: "rgba(240,242,255,0.3)",
          fontFamily: "DM Sans, system-ui, sans-serif",
          fontSizeBase: "14px",
          borderRadius: "10px",
          spacingUnit: "4px",
        },
        rules: {
          ".Input": {
            border: "1px solid rgba(124,58,237,0.25)",
            boxShadow: "none",
            backgroundColor: "rgba(255,255,255,0.04)",
          },
          ".Input:focus": {
            border: "1px solid rgba(124,58,237,0.6)",
            boxShadow: "0 0 0 3px rgba(124,58,237,0.12)",
          },
          ".Label": { color: "rgba(240,242,255,0.5)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase" },
          ".Tab": { border: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
          ".Tab--selected": { border: "1px solid rgba(124,58,237,0.4)", backgroundColor: "rgba(124,58,237,0.08)" },
        },
      },
    });

    const paymentEl = elements.create("payment", { layout: "accordion" });
    paymentEl.mount("#stripe-payment-element");
    paymentEl.on("ready", () => setElementsReady(true));

    stripeRef.current = stripe;
    elementsRef.current = elements;

    return () => {
      try { paymentEl.destroy(); } catch { /* ignore */ }
    };
  }, [stripeReady, clientSecret, publishableKey]);

  const handleContinue = async () => {
    if (!stripeRef.current || !elementsRef.current || loading) return;
    setLoading(true);
    setSubmitError("");

    // Validate card fields
    const { error: submitErr } = await elementsRef.current.submit();
    if (submitErr) {
      setSubmitError(submitErr.message || "Please check your card details.");
      setLoading(false);
      return;
    }

    // Create PaymentMethod (without confirming payment yet)
    const { error: pmErr, paymentMethod } = await stripeRef.current.createPaymentMethod({
      elements: elementsRef.current,
    });
    if (pmErr) {
      setSubmitError(pmErr.message || "Card error. Please try a different card.");
      setLoading(false);
      return;
    }

    // Issue OTP
    const res = await fetch("/api/billing/issue-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_intent_id: paymentIntentId,
        payment_method_id: paymentMethod.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error || "Failed to send verification code.");
      setLoading(false);
      return;
    }

    router.push(
      `/dashboard/billing/verify?pi_id=${paymentIntentId}&pm_id=${encodeURIComponent(paymentMethod.id)}&email=${encodeURIComponent(data.masked_email)}&plan=${plan}&cycle=${cycle}`
    );
  };

  const planMeta = PLAN_DISPLAY[plan] ?? PLAN_DISPLAY.grow;
  const planFeatures = PLAN_FEATURES[plan] ?? PLAN_FEATURES.grow;
  const amountDisplay = planInfo ? `$${(planInfo.amount / 100).toFixed(2)}` : "—";

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/"
        strategy="afterInteractive"
        onLoad={() => setStripeReady(true)}
      />

      <div style={{
        minHeight: "100vh",
        background: "var(--vx-page-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}>
        <div style={{ width: "100%", maxWidth: "960px" }}>

          {/* ── Back link ── */}
          <Link href="/dashboard/billing" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--vx-font-body)",
            fontWeight: 500,
            fontSize: "12px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--vx-text-dim)",
            textDecoration: "none",
            marginBottom: "28px",
          }}>
            <span style={{ fontSize: "16px" }}>←</span>
            Back to Billing
          </Link>

          {/* ── Title ── */}
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{
              fontFamily: "var(--vx-font-display)",
              fontWeight: 800,
              fontSize: "32px",
              letterSpacing: "-1px",
              color: "var(--vx-text-primary)",
              margin: 0,
            }}>
              Secure <span style={{ color: "var(--vx-violet)" }}>Checkout</span>
            </h1>
            <p style={{
              fontFamily: "var(--vx-font-body)",
              fontWeight: 300,
              fontSize: "13px",
              color: "var(--vx-text-muted)",
              marginTop: "6px",
            }}>
              Your payment is processed by Stripe and protected by AES-256 encryption.
            </p>
          </div>

          {initError && (
            <div style={{
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: "12px",
              padding: "14px 20px",
              marginBottom: "24px",
              color: "var(--vx-rose)",
              fontFamily: "var(--vx-font-body)",
              fontSize: "13px",
            }}>
              {initError}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "28px" }}>

            {/* ── Left: Stripe Elements ── */}
            <div style={{
              background: "var(--vx-card-bg)",
              border: "1px solid var(--vx-card-border)",
              borderRadius: "20px",
              padding: "32px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.6), rgba(6,182,212,0.4), transparent)",
              }} />

              <div style={{
                fontFamily: "var(--vx-font-body)",
                fontWeight: 600,
                fontSize: "9px",
                letterSpacing: "3px",
                textTransform: "uppercase",
                color: "var(--vx-text-dim)",
                marginBottom: "20px",
              }}>
                Payment Details
              </div>

              {/* Stripe Elements mount point */}
              {!clientSecret ? (
                <div style={{
                  height: "220px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
              ) : (
                <div id="stripe-payment-element" />
              )}

              {submitError && (
                <div style={{
                  marginTop: "16px",
                  padding: "12px 16px",
                  background: "rgba(244,63,94,0.08)",
                  border: "1px solid rgba(244,63,94,0.25)",
                  borderRadius: "10px",
                  color: "var(--vx-rose)",
                  fontFamily: "var(--vx-font-body)",
                  fontSize: "13px",
                }}>
                  {submitError}
                </div>
              )}

              <button
                onClick={handleContinue}
                disabled={!elementsReady || loading || !!initError}
                style={{
                  width: "100%",
                  marginTop: "24px",
                  padding: "15px 24px",
                  borderRadius: "12px",
                  background: (!elementsReady || loading || !!initError)
                    ? "rgba(124,58,237,0.3)"
                    : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  border: "none",
                  color: "#fff",
                  fontFamily: "var(--vx-font-display)",
                  fontWeight: 700,
                  fontSize: "13px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  cursor: (!elementsReady || loading || !!initError) ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s",
                  boxShadow: "0 8px 28px rgba(124,58,237,0.35)",
                }}
              >
                {loading
                  ? "Sending Code…"
                  : !clientSecret
                  ? "Initializing…"
                  : !elementsReady
                  ? "Loading Payment Form…"
                  : "Continue to Verify →"}
              </button>

              {/* Security badges */}
              <div style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                marginTop: "20px",
                flexWrap: "wrap",
              }}>
                {["🔒 AES-256 Encrypted", "🛡 Stripe Secure", "✓ OTP Verified"].map((b) => (
                  <span key={b} style={{
                    fontFamily: "var(--vx-font-body)",
                    fontSize: "10px",
                    color: "var(--vx-text-dim)",
                    letterSpacing: "0.5px",
                  }}>
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Right: Order summary ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Plan card */}
              <div style={{
                background: "linear-gradient(135deg, #0f0d1f 0%, #1a1040 60%, #0a0e24 100%)",
                border: "1px solid rgba(124,58,237,0.35)",
                borderRadius: "20px",
                padding: "28px",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 12px 40px rgba(124,58,237,0.18)",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "1px",
                  background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.8), rgba(6,182,212,0.5), transparent)",
                }} />

                <div style={{
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "9px",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  color: "rgba(240,242,255,0.3)",
                  marginBottom: "16px",
                }}>
                  Order Summary
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{
                    fontFamily: "var(--vx-font-display)",
                    fontWeight: 800,
                    fontSize: "18px",
                    color: "#fff",
                  }}>
                    {planMeta.label} Plan
                  </span>
                  <span style={{
                    fontFamily: "var(--vx-font-body)",
                    fontSize: "11px",
                    color: "rgba(240,242,255,0.35)",
                    background: "rgba(124,58,237,0.15)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    padding: "3px 8px",
                    borderRadius: "100px",
                    letterSpacing: "1px",
                  }}>
                    {cycle.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "20px" }}>
                  <span style={{
                    fontFamily: "var(--vx-font-display)",
                    fontWeight: 800,
                    fontSize: "38px",
                    letterSpacing: "-1.5px",
                    color: "#fff",
                  }}>
                    {amountDisplay}
                  </span>
                  <span style={{
                    fontFamily: "var(--vx-font-body)",
                    fontWeight: 300,
                    fontSize: "12px",
                    color: "rgba(240,242,255,0.35)",
                  }}>
                    /{cycle === "annual" ? "yr" : "mo"}
                  </span>
                </div>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {planFeatures.map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--vx-cyan)", fontSize: "14px" }}>✓</span>
                      <span style={{
                        fontFamily: "var(--vx-font-body)",
                        fontWeight: 400,
                        fontSize: "12px",
                        color: "rgba(240,242,255,0.6)",
                      }}>
                        {f}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What happens next */}
              <div style={{
                background: "var(--vx-card-bg)",
                border: "1px solid var(--vx-card-border)",
                borderRadius: "16px",
                padding: "20px",
              }}>
                <div style={{
                  fontFamily: "var(--vx-font-body)",
                  fontWeight: 600,
                  fontSize: "9px",
                  letterSpacing: "2.5px",
                  textTransform: "uppercase",
                  color: "var(--vx-text-dim)",
                  marginBottom: "12px",
                }}>
                  Next Steps
                </div>
                {[
                  { n: "1", t: "Enter card details above" },
                  { n: "2", t: "Receive a 6-digit code by email" },
                  { n: "3", t: "Enter the code to confirm payment" },
                ].map(({ n, t }) => (
                  <div key={n} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "7px 0",
                    borderBottom: n !== "3" ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <div style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "rgba(124,58,237,0.15)",
                      border: "1px solid rgba(124,58,237,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--vx-font-display)",
                      fontWeight: 700,
                      fontSize: "10px",
                      color: "var(--vx-violet)",
                      flexShrink: 0,
                    }}>
                      {n}
                    </div>
                    <span style={{
                      fontFamily: "var(--vx-font-body)",
                      fontSize: "12px",
                      color: "var(--vx-text-muted)",
                    }}>
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--vx-page-bg)",
        fontFamily: "var(--vx-font-body)",
        color: "var(--vx-text-dim)",
      }}>
        Loading checkout…
      </div>
    }>
      <CheckoutInner />
    </Suspense>
  );
}
