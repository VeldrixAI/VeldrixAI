import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "./config";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret || _jwtSecret.startsWith("CHANGE_ME")) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[VeldrixAI] JWT_SECRET environment variable is not set. "
      + "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    );
  }
}

const SECRET = new TextEncoder().encode(
  _jwtSecret ?? "veldrix-dev-only-secret-not-for-production"
);

export async function createToken(userId: number, email: string, role: string) {
  return new SignJWT({ sub: String(userId), email, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { sub: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}
