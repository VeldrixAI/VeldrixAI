"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AUTH_API_URL } from "@/lib/config";

interface SessionData {
  plan: string;
  email?: string;
}

const PLAN_DETAILS: Record<string, { name: string; evals: string; features: string[] }> = {
  grow: {
    name: "Grow",
    evals: "25,000 evaluations / month",
    features: [
      "All 5 trust pillars unlocked",
      "Audit trail & full logs",
      "Webhook integrations",
      "Dashboard analytics",
      "Email support",
    ],
  },
  scale: {
    name: "Scale",
    evals: "150,000 evaluations / month",
    features: [
      "Everything in Grow",
      "Priority support (4h SLA)",
      "Custom pillar weights",
      "SSO / SAML",
      "Dedicated Slack channel",
    ],
  },
  enterprise: {
    name: "Enterprise",
    evals: "Unlimited evaluations",
    features: [
      "On-prem / VPC deployment",
      "Custom model fine-tuning",
      "SLA guarantees",
      "Dedicated success manager",
    ],
  },
};

function ConfettiCanvas() {
  useEffect(() => {
    const canvas = document.getElementById("confetti-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      color: string; size: number; rotation: number; rotationSpeed: number;
    }> = [];

    const colors = ["#7c3aed", "#06b6d4", "#a78bfa", "#67e8f9", "#10b981", "#f0f2ff"];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 6,
      });
    }

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.vy += 0.05;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();

        if (p.y > canvas.height) {
          particles[i].y = -20;
          particles[i].x = Math.random() * canvas.width;
        }
      });

      frame++;
      if (frame < 180) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animate();
  }, []);

  return (
    <canvas
      id="confetti-canvas"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}

function BillingSuccessInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setVerifying(false);
      return;
    }

    fetch(`${AUTH_API_URL}/billing/verify-session?session_id=${sessionId}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setSessionData(data);
        setVerifying(false);
      })
      .catch(() => setVerifying(false));
  }, [sessionId]);

  const plan = sessionData?.plan ?? searchParams.get("plan") ?? "grow";
  const planInfo = PLAN_DETAILS[plan] ?? PLAN_DETAILS.grow;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050810",
        color: "#f0f2ff",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <ConfettiCanvas />

      {/* Background orb */}
      <div
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "520px",
          width: "100%",
          textAlign: "center",
          animation: "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Success icon */}
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.1))",
            border: "1px solid rgba(16,185,129,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
            fontSize: "36px",
            animation: "scale-in 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both",
          }}
        >
          ✓
        </div>

        <div
          style={{
            fontSize: "12px",
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: "#10b981",
            marginBottom: "12px",
            fontWeight: 500,
          }}
        >
          Payment Confirmed
        </div>

        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 800,
            color: "#fff",
            margin: "0 0 16px",
            lineHeight: 1.2,
          }}
        >
          Welcome to VeldrixAI{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #a78bfa, #67e8f9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {planInfo.name}
          </span>
        </h1>

        <p style={{ fontSize: "16px", color: "rgba(240,242,255,0.55)", margin: "0 0 36px" }}>
          Your runtime trust infrastructure is now active. You&apos;re all set to govern every AI response.
        </p>

        {/* Unlocked features card */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "28px",
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "rgba(240,242,255,0.4)",
              marginBottom: "16px",
            }}
          >
            What you unlocked
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
              padding: "10px 14px",
              background: "rgba(124,58,237,0.1)",
              borderRadius: "8px",
              border: "1px solid rgba(124,58,237,0.2)",
            }}
          >
            <span style={{ fontSize: "20px" }}>⚡</span>
            <span style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>
              {planInfo.evals}
            </span>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {planInfo.features.map((feat) => (
              <li
                key={feat}
                style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "rgba(240,242,255,0.75)" }}
              >
                <span style={{ color: "#10b981", fontSize: "16px" }}>✓</span>
                {feat}
              </li>
            ))}
          </ul>
        </div>

        {/* Next steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          {[
            { icon: "📖", title: "Read the docs", desc: "SDK quickstart in 5 min", href: "/docs" },
            { icon: "🔑", title: "Get your API key", desc: "Start integrating now", href: "/dashboard/api-keys" },
            { icon: "📊", title: "View dashboard", desc: "Monitor evaluations", href: "/dashboard" },
            { icon: "💬", title: "Join community", desc: "Get help & share feedback", href: "/community" },
          ].map((item) => (
            <a
              key={item.title}
              href={item.href}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "16px",
                textDecoration: "none",
                textAlign: "left",
                transition: "border-color 0.2s, background 0.2s",
              }}
            >
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{item.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "2px" }}>
                {item.title}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(240,242,255,0.4)" }}>{item.desc}</div>
            </a>
          ))}
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "none",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(124,58,237,0.3)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(-2px)";
            (e.target as HTMLButtonElement).style.boxShadow = "0 12px 40px rgba(124,58,237,0.45)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(0)";
            (e.target as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(124,58,237,0.3)";
          }}
        >
          Go to Dashboard →
        </button>

        <p style={{ fontSize: "12px", color: "rgba(240,242,255,0.25)", marginTop: "16px" }}>
          A receipt has been sent to your email.{" "}
          <a href="/dashboard/billing" style={{ color: "rgba(167,139,250,0.7)", textDecoration: "none" }}>
            Manage billing
          </a>
        </p>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense>
      <BillingSuccessInner />
    </Suspense>
  );
}
