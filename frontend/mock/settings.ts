import type {
  SettingsApiKey,
  PolicyExtra,
  NotificationSettings,
  SecuritySettings,
  BillingInfo,
  DeveloperSettings,
} from "./types";

export const settingsAccount = {
  name: "Alex Morgan",
  email: "alex@acme-corp.com",
  role: "Admin",
  workspace: "Acme Corp",
  workspaces: ["Acme Corp", "Acme Labs", "Personal"],
};

export const settingsPreferences = {
  timezone: "America/New_York",
  theme: "Dark" as "Dark" | "Auto",
  dashboardRange: "7d" as "7d" | "14d" | "30d",
};

export const settingsApiKeys: SettingsApiKey[] = [
  {
    id: "key_001",
    label: "Production API",
    key: "ak_live_****7f3a",
    createdAt: "2024-11-15T10:00:00Z",
    lastUsed: "2025-01-14T09:32:00Z",
    status: "Active",
    environment: "Production",
    scopes: ["Analyze", "Generate", "Agent-Check", "Reports"],
  },
  {
    id: "key_002",
    label: "Staging API",
    key: "ak_test_****b2e1",
    createdAt: "2024-12-01T14:00:00Z",
    lastUsed: "2025-01-13T16:45:00Z",
    status: "Active",
    environment: "Staging",
    scopes: ["Analyze", "Generate"],
  },
  {
    id: "key_003",
    label: "CI/CD Pipeline",
    key: "ak_live_****9d4c",
    createdAt: "2024-10-20T08:00:00Z",
    lastUsed: "2025-01-14T06:00:00Z",
    status: "Active",
    environment: "Production",
    scopes: ["Analyze", "Reports"],
  },
  {
    id: "key_004",
    label: "Dev Testing",
    key: "ak_dev_****1a8f",
    createdAt: "2025-01-02T09:00:00Z",
    lastUsed: "2025-01-10T11:20:00Z",
    status: "Active",
    environment: "Development",
    scopes: ["Analyze", "Generate", "Agent-Check"],
  },
  {
    id: "key_005",
    label: "Legacy Integration",
    key: "ak_live_****e5b7",
    createdAt: "2024-08-05T12:00:00Z",
    lastUsed: "2024-12-15T14:30:00Z",
    status: "Disabled",
    environment: "Production",
    scopes: ["Analyze"],
  },
];

export const settingsPolicyExtras: PolicyExtra[] = [
  {
    policyId: "pol_ecs_001",
    strictness: 4,
    region: "Global",
    versions: [
      { version: "1.12.0", date: "2025-01-10", notes: ["Added emoji-based bypass detection", "Updated PII regex for international phone formats"] },
      { version: "1.11.0", date: "2024-12-05", notes: ["Improved toxicity classifier accuracy by 12%"] },
      { version: "1.10.0", date: "2024-11-01", notes: ["Added brand safety guardrails", "New compliance reporting fields"] },
      { version: "1.9.0", date: "2024-09-15", notes: ["Initial multilingual support (EN, ES, FR, DE)"] },
    ],
  },
  {
    policyId: "pol_pii_002",
    strictness: 5,
    region: "US",
    versions: [
      { version: "2.3.1", date: "2025-01-08", notes: ["Fixed false positives on UK postal codes", "Added IBAN detection"] },
      { version: "2.3.0", date: "2024-12-20", notes: ["Added Canadian SIN detection"] },
      { version: "2.2.0", date: "2024-11-10", notes: ["Improved email extraction precision"] },
    ],
  },
  {
    policyId: "pol_pig_003",
    strictness: 5,
    region: "Global",
    versions: [
      { version: "3.1.0", date: "2025-01-12", notes: ["Added multi-stage attack chain detection", "Improved DAN-style jailbreak coverage"] },
      { version: "3.0.0", date: "2024-12-01", notes: ["Major rewrite of injection classifier", "Added system prompt extraction defense"] },
      { version: "2.5.0", date: "2024-10-15", notes: ["Initial encoding trick detection (base64, rot13)"] },
    ],
  },
  {
    policyId: "pol_dcl_004",
    strictness: 3,
    region: "US",
    versions: [
      { version: "1.5.2", date: "2025-01-05", notes: ["Updated role mapping for new org hierarchy"] },
      { version: "1.5.0", date: "2024-12-10", notes: ["Added team-level access controls"] },
      { version: "1.4.0", date: "2024-11-01", notes: ["Initial data classification taxonomy"] },
    ],
  },
  {
    policyId: "pol_cp_005",
    strictness: 3,
    region: "Global",
    versions: [
      { version: "2.0.4", date: "2025-01-09", notes: ["Expanded brand safety keyword list"] },
      { version: "2.0.0", date: "2024-12-01", notes: ["Migrated to v2 content classifier"] },
      { version: "1.8.0", date: "2024-10-15", notes: ["Added misinformation detection"] },
    ],
  },
  {
    policyId: "pol_gdpr_009",
    strictness: 4,
    region: "EU",
    versions: [
      { version: "1.1.0", date: "2025-01-03", notes: ["Added cross-border transfer logging", "Updated consent verification flow"] },
      { version: "1.0.0", date: "2024-11-01", notes: ["Initial GDPR compliance policy release"] },
    ],
  },
];

export const settingsNotifications: NotificationSettings = {
  emailHighRisk: true,
  weeklyReport: true,
  errorSpike: false,
  channels: { email: "alex@acme-corp.com", slackWebhook: "" },
  frequency: "immediate",
};

export const settingsSecurity: SecuritySettings = {
  mfaEnabled: false,
  activeSessions: 3,
  ipAllowlist: ["10.0.0.0/8", "192.168.1.0/24"],
  auditRetention: 90,
  reportRetention: 180,
  noStoreMode: false,
};

export const settingsBilling: BillingInfo = {
  plan: "Growth",
  requestsThisMonth: 124500,
  quota: 250000,
  invoices: [
    { id: "inv_001", month: "January 2025", amount: "$499.00", status: "Pending" },
    { id: "inv_002", month: "December 2024", amount: "$499.00", status: "Paid" },
    { id: "inv_003", month: "November 2024", amount: "$349.00", status: "Paid" },
    { id: "inv_004", month: "October 2024", amount: "$349.00", status: "Paid" },
  ],
};

export const settingsDeveloper: DeveloperSettings = {
  webhooks: [
    {
      id: "wh_001",
      url: "https://api.acme-corp.com/webhooks/aegis",
      events: ["request.blocked", "request.escalated"],
      secretToken: "whsec_****a3f1",
      active: true,
    },
    {
      id: "wh_002",
      url: "https://staging.acme-corp.com/webhooks/aegis",
      events: ["policy.updated"],
      secretToken: "whsec_****d8e2",
      active: false,
    },
  ],
  envVars: [
    { name: "AEGIS_API_KEY", description: "Your API authentication key", example: "ak_live_xxxxxxxxxxxx" },
    { name: "AEGIS_BASE_URL", description: "API base URL", example: "https://api.aegisai.com/v1" },
    { name: "AEGIS_POLICY_ID", description: "Default policy ID for requests", example: "pol_ecs_001" },
    { name: "AEGIS_LOG_LEVEL", description: "Logging verbosity (debug, info, warn, error)", example: "info" },
  ],
};
