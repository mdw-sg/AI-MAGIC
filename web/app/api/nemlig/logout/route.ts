import { NextResponse } from "next/server";
import { clearSession } from "@/lib/nemlig/session";

export async function POST() {
  clearSession();
  return NextResponse.json({ ok: true });
}
