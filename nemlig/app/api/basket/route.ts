import { NextResponse } from "next/server";
import { addItemsToBasket, type BasketRequestItem } from "@/lib/basket";
import { NotLoggedInError } from "@/lib/client";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { items?: BasketRequestItem[] } | null;
  const items = (body?.items ?? []).filter(
    (i) => typeof i?.name === "string" && typeof i?.productId === "string"
  );
  if (items.length === 0) {
    return NextResponse.json({ error: "Ingen varer valgt." }, { status: 400 });
  }
  try {
    const results = await addItemsToBasket(items);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke lægge i kurven" },
      { status: error instanceof NotLoggedInError ? 401 : 502 }
    );
  }
}
