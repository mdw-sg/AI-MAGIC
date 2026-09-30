import { NextResponse } from "next/server";
import { NotLoggedInError } from "@/lib/client";
import { syncOffers } from "@/lib/offers";
import { syncOrders } from "@/lib/orders";

export async function POST() {
  try {
    const cache = await syncOrders();
    const offers = await syncOffers();
    return NextResponse.json({
      orderCount: cache.orders.length,
      offerCount: offers.offers.length,
      syncedAt: cache.syncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hentning fejlede" },
      { status: error instanceof NotLoggedInError ? 401 : 502 }
    );
  }
}
