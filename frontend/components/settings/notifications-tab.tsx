"use client";

interface NotificationsTabProps {
  searchQuery: string;
  showToast: (msg: string) => void;
}

export default function NotificationsTab({ searchQuery }: NotificationsTabProps) {
  const hidden = (terms: string) =>
    searchQuery && !terms.toLowerCase().includes(searchQuery.toLowerCase()) ? " vx-hidden" : "";

  return (
    <div>
      <div className={"vx-card" + hidden("notifications alerts email slack webhook")} data-search-terms="notifications alerts email slack webhook">
        <div className="vx-card-header">
          <div>
            <div className="vx-card-title">Notifications</div>
            <div className="vx-card-subtitle">Alert preferences and delivery channels</div>
          </div>
          <span className="vx-badge vx-badge-warning">Coming Soon</span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--vx-text-secondary)", lineHeight: 1.6 }}>
          Email alerts, Slack webhooks, and notification frequency settings will be available in a future release.
          Notification infrastructure is not yet connected to a backend service.
        </p>
      </div>
    </div>
  );
}
