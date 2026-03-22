"use client";

interface SecurityTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

export default function SecurityTab({ searchQuery }: SecurityTabProps) {
  const hidden = (terms: string) =>
    searchQuery && !terms.toLowerCase().includes(searchQuery.toLowerCase()) ? " vx-hidden" : "";

  return (
    <div>
      <div className={"vx-card" + hidden("security mfa sessions ip allowlist retention")} data-search-terms="security mfa sessions ip allowlist retention">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Security</div>
            <div className="vx-card-subtitle">MFA, session management, IP allowlist, and data retention</div>
          </div>
          <span className="vx-badge vx-badge-warning">Coming Soon</span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--vx-text-secondary)", lineHeight: 1.6 }}>
          Security controls including MFA, session management, IP allowlisting, and data retention policies
          will be available in a future release.
        </p>
      </div>
    </div>
  );
}
