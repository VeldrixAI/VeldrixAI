/**
 * auth-guard.ts
 * Centralized auth guard utility for VeldrixAI.
 * Use this before any billing or protected action.
 */

import { AUTH_COOKIE } from "@/lib/config";

/**
 * Returns true if an auth token/session cookie is present.
 * Works client-side only (reads document.cookie).
 */
export function isAuthenticated(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.cookie.includes(AUTH_COOKIE) ||
    document.cookie.includes("aegis_session") // legacy fallback
  );
}

/**
 * Retrieves the raw session cookie value, if present.
 */
export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Redirects to /login with a return URL if the user is not authenticated.
 * Returns true if authenticated (caller may proceed), false if redirecting.
 *
 * @param redirectPath  The path to return to after login (default: '/billing')
 * @param extraParams   Additional query params appended to the redirect URL
 * @param router        Next.js router instance (must pass `useRouter()` result)
 */
export function requireAuth(
  redirectPath: string = "/billing",
  extraParams: Record<string, string> = {},
  router: { push: (url: string) => void }
): boolean {
  if (isAuthenticated()) return true;

  const params = new URLSearchParams({ redirect: redirectPath, ...extraParams });
  router.push(`/login?${params.toString()}`);
  return false;
}

/**
 * Hook-compatible guard for use inside React components.
 * Usage:
 *   const guard = useAuthGuard();
 *   const proceed = guard('/billing', { plan: 'grow' });
 *   if (!proceed) return;  // redirecting…
 */
export function createAuthGuard(router: { push: (url: string) => void }) {
  return (
    redirectPath: string = "/billing",
    extraParams: Record<string, string> = {}
  ): boolean => requireAuth(redirectPath, extraParams, router);
}
