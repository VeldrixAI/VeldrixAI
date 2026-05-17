export const AUTH_API_URL =
  process.env.VELDRIX_AUTH_API_URL ?? "http://localhost:8000";

export const CORE_API_URL =
  process.env.VELDRIX_CORE_API_URL ?? "http://localhost:8001";

export const CONNECTORS_API_URL =
  process.env.VELDRIX_CONNECTORS_API_URL ?? "http://localhost:8002";

export const AUTH_COOKIE = "veldrix_session";
