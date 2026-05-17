// lib/constants/nav-links.ts
// All navigation and footer links for the landing page.
// Never hardcode href strings directly in JSX — reference these arrays.

export const NAV_LINKS = [
  { label: "Products",  href: "#pillars" },
  { label: "Solutions", href: "#governance" },
  { label: "Pricing",   href: "#pricing" },
  { label: "Docs",      href: "/docs" },
] as const;

export const FOOTER_PLATFORM_LINKS = [
  { label: "Trust Engine",   href: "/docs/trust-overview" },
  { label: "Audit Trails",   href: "/docs/audit-trails" },
  { label: "Policy Engine",  href: "/docs/policy-overview" },
  { label: "Agent Guard",    href: "/docs/agent-overview" },
  { label: "Risk Scoring",   href: "/docs/ref-enforcement" },
] as const;

export const FOOTER_COMPLIANCE_LINKS = [
  { label: "SOC2 Type II", href: "/docs/ref-security" },
  { label: "ISO 27001",    href: "/docs/ref-security" },
  { label: "GDPR",         href: "/docs/ref-security" },
  { label: "HIPAA",        href: "/docs/ref-security" },
  { label: "AI Act",       href: "/docs/ref-security" },
] as const;

export const FOOTER_DEVELOPER_LINKS = [
  { label: "API Reference", href: "/docs/integrations-rest" },
  { label: "SDK Docs",      href: "/docs/integrations-python" },
  { label: "Changelog",     href: "#" },
  { label: "Status",        href: "#" },
] as const;

export const FOOTER_COMPANY_LINKS = [
  { label: "About",    href: "#" },
  { label: "Blog",     href: "#" },
  { label: "Careers",  href: "#" },
  { label: "Contact",  href: "mailto:support@veldrixai.ca" },
] as const;
