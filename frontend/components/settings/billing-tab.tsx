"use client";

import Link from "next/link";

interface BillingTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

export default function BillingTab({ searchQuery }: BillingTabProps) {
  const hidden = (terms: string) =>
    searchQuery && !terms.toLowerCase().includes(searchQuery.toLowerCase()) ? " vx-hidden" : "";

  return (
    <div>
      <div className={"vx-card" + hidden("billing plan usage quota invoices")} data-search-terms="billing plan usage quota invoices">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Billing & Usage</div>
            <div className="vx-card-subtitle">Plan, quota, and invoice management</div>
          </div>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--vx-text-secondary)", lineHeight: 1.6, marginBottom: "16px" }}>
          Manage your subscription, view usage quotas, and access your billing portal.
        </p>
        <Link
          href="/dashboard/billing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Manage billing →
        </Link>
      </div>
    </div>
  );
}
