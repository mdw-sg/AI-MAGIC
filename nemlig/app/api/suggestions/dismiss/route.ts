import { NextResponse } from "next/server";
import { dismissSuggestion } from "@/lib/suggestions";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null;
  if (typeof body?.productId !== "string") {
    return NextResponse.json({ error: "Mangler varenummer" }, { status: 400 });
  }
  dismissSuggestion(body.productId);
  return NextResponse.json({ ok: true });
}
