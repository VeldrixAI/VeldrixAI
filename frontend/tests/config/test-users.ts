export const TEST_USERS = {
  admin: {
    email: process.env.VELDRIX_TEST_EMAIL!,
    password: process.env.VELDRIX_TEST_PASSWORD!,
    role: 'admin' as const,
  },
} as const;

export const VELDRIX_ROUTES = {
  home:             '/',
  login:            '/login',
  signup:           '/signup',
  dashboard:        '/dashboard',
  evaluate:         '/dashboard/evaluate',
  apiKeys:          '/dashboard/api-keys',
  auditTrails:      '/dashboard/audit-trails',
  promptGenerator:  '/dashboard/prompt-generator',
  reports:          '/dashboard/reports',
  sdk:              '/dashboard/sdk',
  billing:          '/dashboard/billing',
  profile:          '/dashboard/profile',
} as const;

// Five trust pillars returned by the evaluation engine
export const TRUST_PILLARS = [
  'safety_toxicity',
  'hallucination',
  'bias_fairness',
  'prompt_security',
  'compliance_pii',
] as const;

export type TrustPillar = typeof TRUST_PILLARS[number];

// Verdict labels used in audit trail UI
export const VERDICTS = ['ALLOW', 'WARN', 'REVIEW', 'BLOCK'] as const;
export type Verdict = typeof VERDICTS[number];

// Prompt Generator variants
export const PROMPT_VARIANTS = ['Strict', 'Balanced', 'Adaptive'] as const;
export type PromptVariant = typeof PROMPT_VARIANTS[number];
