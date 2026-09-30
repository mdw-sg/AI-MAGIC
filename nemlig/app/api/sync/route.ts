import { NextResponse } from "next/server";
import { NotLoggedInError } from "@/lib/client";
import { syncOrders } from "@/lib/orders";

export async function POST() {
  try {
    const cache = await syncOrders();
    return NextResponse.json({ orderCount: cache.orders.length, syncedAt: cache.syncedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hentning fejlede" },
      { status: error instanceof NotLoggedInError ? 401 : 502 }
    );
  }
}
