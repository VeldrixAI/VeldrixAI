import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CORE_API_URL, AUTH_COOKIE } from "@/lib/config";

export async function POST(request: NextRequest) {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${CORE_API_URL}/trust/evaluate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorBody: unknown;
      try { errorBody = JSON.parse(text); } catch { errorBody = { detail: text || "Upstream error" }; }
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to evaluate trust" }, { status: 500 });
  }
}
