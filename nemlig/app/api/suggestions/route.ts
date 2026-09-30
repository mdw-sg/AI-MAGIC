import { NextResponse } from "next/server";
import { generateSuggestions } from "@/lib/suggestions";

export async function POST() {
  try {
    const cache = await generateSuggestions();
    return NextResponse.json({ count: cache.suggestions.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI-forslag fejlede" },
      { status: 502 }
    );
  }
}
