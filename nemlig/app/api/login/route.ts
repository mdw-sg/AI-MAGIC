import { NextResponse } from "next/server";
import { loginWithBrowser } from "@/lib/session";

export async function POST() {
  try {
    const session = await loginWithBrowser();
    return NextResponse.json({ savedAt: session.savedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login fejlede" },
      { status: 400 }
    );
  }
}
