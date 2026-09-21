import { NextResponse } from "next/server";
import { isRefreshInProgress } from "@/lib/sommerhuse/db";
import { runRefresh } from "@/lib/sommerhuse/pipeline";

export async function POST() {
  if (isRefreshInProgress()) {
    return NextResponse.json(
      { error: "En opdatering kører allerede eller blev lige afsluttet. Prøv igen om lidt." },
      { status: 429 }
    );
  }

  const results = await runRefresh();
  return NextResponse.json({ results });
}
