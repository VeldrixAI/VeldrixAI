"use client";

import { useRouter } from "next/navigation";
import type { PricingPlan } from "./PricingCard";
import { AUTH_COOKIE } from "@/lib/config";

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
  const router = useRouter();

  const handleClick = () => {
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

  return (
    <button onClick={handleClick} className={className}>
      {children ?? plan.cta}
    </button>
  );
}
