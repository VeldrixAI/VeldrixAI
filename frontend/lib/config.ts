// Internal service URLs. In production these env vars are always set; the
// localhost fallbacks are dev-only and compiled out of production bundles —
// the `process.env.NODE_ENV === "production"` branch (and its localhost
// literal) is dead-code-eliminated by the minifier, so no localhost ships.
export const AUTH_API_URL =
  process.env.VELDRIX_AUTH_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");

export const CORE_API_URL =
  process.env.VELDRIX_CORE_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8001");

export const CONNECTORS_API_URL =
  process.env.VELDRIX_CONNECTORS_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8002");

export const AUTH_COOKIE = "veldrix_session";
