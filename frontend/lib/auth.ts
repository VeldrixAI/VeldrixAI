import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "./config";

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if ((!s || s.startsWith("CHANGE_ME")) && process.env.NODE_ENV === "production") {
    throw new Error(
      "[VeldrixAI] JWT_SECRET environment variable is not set. "
      + "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    );
  }
  return new TextEncoder().encode(s ?? "veldrix-dev-only-secret-not-for-production");
}

export async function createToken(userId: number, email: string, role: string) {
  return new SignJWT({ sub: String(userId), email, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
