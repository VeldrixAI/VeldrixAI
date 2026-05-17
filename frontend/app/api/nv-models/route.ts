import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

const FALLBACK_MODELS = [
  "meta/llama-guard-4-12b",
  "meta/llama-3.1-8b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
];

export async function GET() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/models/providers`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ models: FALLBACK_MODELS });
    }

    const data = await res.json();
    // Extract NVIDIA NIM models from the providers list
    const nimProvider = Array.isArray(data) ? data.find((p: { provider: string }) => p.provider === "NVIDIA NIM") : null;
    const models = nimProvider?.models ?? FALLBACK_MODELS;
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}
