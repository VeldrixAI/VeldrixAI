/**
 * Returns the session JWT to the client so it can authenticate the WebSocket
 * connection to the core service.
 * The cookie is httpOnly so this server-side route is the only way to read it.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/config";

export async function GET() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ token });
}
