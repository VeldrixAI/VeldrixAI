import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";
import { safeJson, serviceUnavailable, errorMessage } from "@/lib/proxy";

async function getToken() {
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const token = await getToken();
  if (!token) return unauthorized();

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/reports/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await safeJson(res);
    if (!res.ok) {
      return NextResponse.json({ error: errorMessage(payload, "Failed to load reports") }, { status: res.status });
    }
    return NextResponse.json(payload);
  } catch {
    return serviceUnavailable("reports service");
  }
}

export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return unauthorized();

  const body = await request.json();

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/reports/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await safeJson(res);
    if (!res.ok) {
      return NextResponse.json({ error: errorMessage(payload, "Failed to generate report") }, { status: res.status });
    }
    return NextResponse.json(payload, { status: 201 });
  } catch {
    return serviceUnavailable("reports service");
  }
}
