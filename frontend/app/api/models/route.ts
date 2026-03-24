import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/models/providers`, {
      headers: { Authorization: `Bearer ${token}` },
      // Cache for 5 minutes — model catalog changes rarely
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail ?? "Failed to fetch models" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Models service unavailable" },
      { status: 502 }
    );
  }
}
