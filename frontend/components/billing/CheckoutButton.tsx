"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingPlan } from "./PricingCard";
import { AUTH_API_URL } from "@/lib/config";

interface CheckoutButtonProps {
  plan: PricingPlan;
  cycle: "monthly" | "annual";
  className?: string;
  children?: React.ReactNode;
}

export default function CheckoutButton({
  plan,
  cycle,
  className,
  children,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
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
        // Not logged in — redirect to login with return params
        router.push(
          `/login?redirect=/dashboard/billing&plan=${plan.id}&cycle=${cycle}`
        );
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to start checkout. Please try again.");
        return;
      }

      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "Redirecting…" : children ?? plan.cta}
    </button>
  );
}
