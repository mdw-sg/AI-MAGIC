import { NextResponse } from "next/server";
import { clearBasket } from "@/lib/basket";
import { NotLoggedInError } from "@/lib/client";

export async function POST() {
  try {
    const removed = await clearBasket();
    return NextResponse.json({ removed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke tømme kurven" },
      { status: error instanceof NotLoggedInError ? 401 : 502 }
    );
  }
}
