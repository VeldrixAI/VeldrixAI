import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CONNECTORS_API_URL, AUTH_COOKIE } from "@/lib/config";

const FALLBACK_MODELS = [
  { id: "groq-llama-70b", name: "Llama 3.3 70B (Groq)", provider: "Groq", speed: "ultra-fast", available: true },
  { id: "groq-mixtral", name: "Mixtral 8x7B (Groq)", provider: "Groq", speed: "fast", available: true },
  { id: "nim-llama-8b", name: "Llama 3.1 8B (NIM)", provider: "NVIDIA NIM", speed: "standard", available: true },
];

export async function GET() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${CONNECTORS_API_URL}/api/prompts/models`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) return NextResponse.json(FALLBACK_MODELS);
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : FALLBACK_MODELS);
  } catch {
    return NextResponse.json(FALLBACK_MODELS);
  }
}
