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
    const response = await fetch(`${CORE_API_URL}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer veldrix-internal-dev-key-2026`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: body.prompt,
        response: body.response,
        model: body.model,
        provider: body.provider,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || "Evaluation failed" }, { status: response.status });
    }

    // Map core response to the shape the evaluate page expects
    return NextResponse.json({
      data: {
        final_score: {
          value: (data.trust_score?.overall ?? 0) * 100,
          confidence: 1.0,
          risk_level: data.trust_score?.verdict === "ALLOW" ? "safe" :
                      data.trust_score?.verdict === "WARN" ? "medium" :
                      data.trust_score?.verdict === "BLOCK" ? "high" : "low",
        },
        pillar_results: Object.fromEntries(
          Object.entries(data.pillars ?? {}).map(([key, val]: [string, any]) => [
            key,
            {
              metadata: { name: key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), weight: 0.2 },
              score: val.score != null ? { value: val.score * 100 } : undefined,
              flags: val.flags ?? [],
              status: val.status ?? "ok",
            }
          ])
        ),
        metadata: { request_id: data.request_id },
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to evaluate trust" }, { status: 500 });
  }
}