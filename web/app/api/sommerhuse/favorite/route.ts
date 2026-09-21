import { NextResponse } from "next/server";
import { toggleFavorite } from "@/lib/sommerhuse/db";

export async function POST(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }
  const listing = toggleFavorite(body.id);
  if (!listing) {
    return NextResponse.json({ error: "Ukendt bolig" }, { status: 404 });
  }
  return NextResponse.json({ listing });
}
