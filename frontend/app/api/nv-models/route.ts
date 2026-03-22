import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Substrings that identify non-generative models (embeddings, safety classifiers, etc.)
const EXCLUDE_TERMS = [
  "embed", "reward", "guard", "shield", "parse",
  "translate", "nvclip", "streampetr", "deplot",
  "paligemma", "kosmos", "recurrentgemma", "neva",
  "vila", "gliner", "safety",
];

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "..", "nv_models.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { data: { id: string }[] };

    const models = data.data
      .filter((m) => {
        const id = m.id.toLowerCase();
        return !EXCLUDE_TERMS.some((ex) => id.includes(ex));
      })
      .map((m) => m.id);

    // Deduplicate (some models appear twice in the list)
    const unique = [...new Set(models)];
    return NextResponse.json(unique);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
