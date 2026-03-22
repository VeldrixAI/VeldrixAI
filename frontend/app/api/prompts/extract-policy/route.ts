import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

export async function POST(request: NextRequest) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const backendForm = new FormData();
    backendForm.append("file", file);

    const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/extract-policy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: backendForm,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ detail: "Extraction failed" }));
      return NextResponse.json({ error: payload.detail || "Extraction failed" }, { status: res.status });
    }

    const payload = await res.json();
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
