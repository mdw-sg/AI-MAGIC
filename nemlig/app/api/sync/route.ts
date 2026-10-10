import { NextResponse } from "next/server";
import { analyzeOrders } from "@/lib/analysis";
import { NotLoggedInError } from "@/lib/client";
import { syncOffers } from "@/lib/offers";
import { syncOrders } from "@/lib/orders";
import { checkStock } from "@/lib/stock";

export async function POST() {
  try {
    const cache = await syncOrders();
    const offers = await syncOffers();
    // Lagertjek af de lister, der typisk ender i kurven.
    const analysis = analyzeOrders(cache.orders, offers);
    const stock = await checkStock([
      ...analysis.standard,
      ...analysis.dueSoon,
      ...analysis.household,
    ]);
    const problems = Object.values(stock.items).filter((s) => s.status !== "ok").length;
    return NextResponse.json({
      orderCount: cache.orders.length,
      offerCount: offers.offers.length,
      stockProblems: problems,
      syncedAt: cache.syncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hentning fejlede" },
      { status: error instanceof NotLoggedInError ? 401 : 502 }
    );
  }
}
