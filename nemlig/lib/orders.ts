import { connect } from "./client";
import { readJsonFile, writeJsonFile } from "./storage";
import type { Order, OrderCache, OrderLine } from "./types";

const CACHE_FILE = "orders.json";
const MAX_ORDERS = 40;
const PAGE_SIZE = 10;
const DELIVERED = 4;
const DELAY_BETWEEN_REQUESTS_MS = 300;

// Kun de felter vi faktisk bruger. Nemlig's svar indeholder også
// leveringsadresse, navn og telefonnummer — de læses aldrig ind i vores typer
// og gemmes derfor aldrig.
type RawOrderSummary = {
  Id: number;
  OrderNumber: string;
  OrderDate: string;
  Status: number;
  SubTotal: number;
  DeliveryTime?: { Start?: string } | null;
};

type RawOrderLine = {
  ProductNumber: string;
  ProductName: string;
  Description?: string;
  Unit?: string;
  Quantity: number;
  AverageItemPrice: number;
  Amount: number;
  OriginalAmount: number;
  GroupName?: string;
  MainGroupName?: string;
  ImageUrl?: string;
  ProductUrl?: string;
  CampaignName?: string;
  IsMealBox?: boolean;
  IsProductLine?: boolean;
  IsDepositLine?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLine(raw: RawOrderLine): OrderLine {
  return {
    productId: String(raw.ProductNumber),
    name: raw.ProductName,
    description: raw.Description ?? "",
    unit: raw.Unit ?? "",
    quantity: raw.Quantity,
    unitPrice: raw.AverageItemPrice,
    amount: raw.Amount,
    originalAmount: raw.OriginalAmount,
    group: raw.GroupName ?? "",
    mainGroup: raw.MainGroupName ?? "",
    imageUrl: raw.ImageUrl || null,
    productUrl: raw.ProductUrl || null,
    campaignName: raw.CampaignName || null,
  };
}

export function getOrderCache(): OrderCache | null {
  return readJsonFile<OrderCache>(CACHE_FILE);
}

/**
 * Henter de seneste ordrer fra nemlig. Leverede ordrer ændrer sig ikke, så
 * deres varelinjer hentes kun første gang; kun nye eller ikke-leverede ordrer
 * slås op igen.
 */
export async function syncOrders(): Promise<OrderCache> {
  const nemlig = await connect();
  const cached = new Map((getOrderCache()?.orders ?? []).map((o) => [o.id, o]));

  const summaries: RawOrderSummary[] = [];
  for (let skip = 0; summaries.length < MAX_ORDERS; skip += PAGE_SIZE) {
    const page = await nemlig.getJson<{ Orders?: RawOrderSummary[]; NumberOfPages?: number }>(
      `/webapi/order/GetBasicOrderHistory?skip=${skip}&take=${PAGE_SIZE}`
    );
    const orders = page.Orders ?? [];
    summaries.push(...orders);
    if (orders.length < PAGE_SIZE) break;
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  const orders: Order[] = [];
  for (const summary of summaries.slice(0, MAX_ORDERS)) {
    const existing = cached.get(summary.Id);
    if (existing && existing.status === DELIVERED) {
      orders.push(existing);
      continue;
    }
    const details = await nemlig.getJson<{ Lines?: RawOrderLine[] }>(
      `/webapi/v2/order/GetOrderHistory/${summary.Id}`
    );
    orders.push({
      id: summary.Id,
      orderNumber: summary.OrderNumber,
      orderDate: summary.OrderDate,
      deliveryDate: summary.DeliveryTime?.Start ?? null,
      status: summary.Status,
      subTotal: summary.SubTotal,
      lines: (details.Lines ?? [])
        .filter((l) => l.IsProductLine !== false && !l.IsDepositLine && !l.IsMealBox)
        .map(toLine),
    });
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  const cache: OrderCache = { syncedAt: new Date().toISOString(), orders };
  writeJsonFile(CACHE_FILE, cache);
  return cache;
}
