import type { ProductStats } from "./analysis";
import { resolveProduct, sleep, type RawBasket } from "./basket";
import { basketItemFor } from "./basketItem";
import { connect } from "./client";
import { readJsonFile, writeJsonFile } from "./storage";

const CACHE_FILE = "stock.json";
const DELAY_BETWEEN_REQUESTS_MS = 150;

export type StockStatus = {
  /** ok: varen selv er på lager. substitute: en anden udgave vælges. */
  status: "ok" | "substitute" | "unavailable" | "notFound" | "error";
  /** Den vare, "Læg i kurv" vil vælge, hvis den ikke er varen selv. */
  chosenName: string | null;
  note: string | null;
};

export type StockCache = {
  checkedAt: string;
  /** Nøgle: varenummeret fra analysen (ProductStats.productId). */
  items: Record<string, StockStatus>;
};

export function getStockCache(): StockCache | null {
  return readJsonFile<StockCache>(CACHE_FILE);
}

/**
 * Slår varerne op hos nemlig præcis som "Læg i kurv" gør — men uden at lægge
 * noget i kurven — så udsolgte varer og erstatninger kan vises på forhånd.
 */
export async function checkStock(products: ProductStats[]): Promise<StockCache> {
  const nemlig = await connect();
  const basket = await nemlig.getJson<RawBasket>("/webapi/basket/GetBasket");
  const items: Record<string, StockStatus> = {};

  for (const p of products) {
    if (items[p.productId]) continue;
    try {
      const { product, note, status } = await resolveProduct(nemlig, basket, basketItemFor(p));
      if (!product) {
        items[p.productId] = {
          status: status === "notFound" ? "notFound" : "unavailable",
          chosenName: null,
          note,
        };
      } else if (product.Name === p.name) {
        items[p.productId] = { status: "ok", chosenName: null, note: null };
      } else {
        items[p.productId] = { status: "substitute", chosenName: product.Name, note };
      }
    } catch (error) {
      items[p.productId] = {
        status: "error",
        chosenName: null,
        note: error instanceof Error ? error.message : "Ukendt fejl",
      };
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  const cache: StockCache = { checkedAt: new Date().toISOString(), items };
  writeJsonFile(CACHE_FILE, cache);
  return cache;
}
