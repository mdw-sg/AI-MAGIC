import { connect, type NemligConnection } from "./client";
import { isHousehold, isOrganic, productKey } from "./preferences";

const MAX_ITEMS = 150;
const MAX_QUANTITY = 30;
const SEARCH_RESULTS = 15;
const DELAY_BETWEEN_REQUESTS_MS = 250;

export type BasketRequestItem = {
  /** Varenummer fra ordrehistorikken — kan være udgået hos nemlig. */
  productId: string;
  name: string;
  mainGroup: string;
  quantity: number;
};

export type BasketItemResult = {
  requestedName: string;
  status: "added" | "already" | "unavailable" | "notFound" | "error";
  /** Hvorfor netop denne vare blev valgt, fx "Dansk — øko-udgaven er udsolgt". */
  note: string | null;
  chosen: {
    productId: string;
    name: string;
    description: string;
    price: number;
    isOrganic: boolean;
    isDanish: boolean;
    offer: string | null;
  } | null;
  quantity: number;
};

// Kun de felter, vi bruger. Kurvens svar indeholder også faktura- og
// leveringsadresse; de læses aldrig ind og sendes aldrig videre.
type RawBasket = {
  TimeslotUtc?: string;
  DeliveryZoneId?: number;
  DeliveryTimeSlot?: { Id?: string | number } | null;
  Lines?: { Id?: string; ProductId?: string; Quantity?: number }[];
};

type RawProduct = {
  Id: string;
  Name: string;
  Description?: string;
  Price: number;
  Labels?: string[];
  Availability?: {
    IsAvailableInStock?: boolean;
    IsAvailableFewInStock?: boolean;
    IsDeliveryAvailable?: boolean;
  };
  Campaign?: {
    Type?: string;
    MinQuantity?: number;
    TotalPrice?: number;
    DiscountPercent?: number;
    CampaignPrice?: number;
  } | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function productIsOrganic(p: RawProduct): boolean {
  return isOrganic(p.Name) || (p.Labels ?? []).some((l) => /^øko/i.test(l));
}

function productIsDanish(p: RawProduct): boolean {
  return (p.Labels ?? []).some((l) => /danmark|dansk/i.test(l)) || /danmark/i.test(p.Description ?? "");
}

function inStock(p: RawProduct): boolean {
  const a = p.Availability;
  if (!a) return true;
  // "Få på lager" melder IsAvailableInStock=false, men kan stadig bestilles.
  return a.IsDeliveryAvailable !== false && (a.IsAvailableInStock !== false || a.IsAvailableFewInStock === true);
}

function describeOffer(c: RawProduct["Campaign"]): string | null {
  if (!c) return null;
  if (c.MinQuantity && c.MinQuantity > 1 && c.TotalPrice) return `${c.MinQuantity} for ${c.TotalPrice} kr.`;
  if (c.DiscountPercent) return `${c.DiscountPercent}% rabat`;
  if (c.CampaignPrice) return `Tilbud ${c.CampaignPrice} kr.`;
  return "Tilbud";
}

function basketQuantities(basket: RawBasket): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of basket.Lines ?? []) {
    const id = line.Id ?? line.ProductId;
    if (id) map.set(String(id), line.Quantity ?? 0);
  }
  return map;
}

/**
 * Finder den vare, der skal i kurven, efter brugerens regel: øko på lager,
 * ellers dansk på lager. Varer, der i forvejen ikke var øko (fx gær eller
 * husholdningsvarer), tages som den bedste udgave på lager.
 */
async function resolveProduct(
  nemlig: NemligConnection,
  basket: RawBasket,
  item: BasketRequestItem
): Promise<{ product: RawProduct | null; note: string | null; status: BasketItemResult["status"] }> {
  const params = new URLSearchParams({
    query: item.name,
    take: String(SEARCH_RESULTS),
    skip: "0",
    recipeCount: "0",
    timeslotUtc: basket.TimeslotUtc ?? "",
    deliveryZoneId: String(basket.DeliveryZoneId ?? ""),
    TimeSlotId: String(basket.DeliveryTimeSlot?.Id ?? ""),
  });
  const result = await nemlig.getJson<{ Products?: { Products?: RawProduct[] } }>(
    `/searchgateway/api/search?${params}`,
    nemlig.searchOrigin
  );
  const key = productKey(item.name);
  const candidates = (result.Products?.Products ?? []).filter(
    (p) => p.Id === item.productId || productKey(p.Name) === key
  );
  if (candidates.length === 0) return { product: null, note: null, status: "notFound" };

  const available = candidates.filter(inStock);
  // Samme varenummer som sidst foretrækkes, når alt andet er lige.
  const rank = (a: RawProduct, b: RawProduct) =>
    Number(b.Id === item.productId) - Number(a.Id === item.productId);

  const organic = available.filter(productIsOrganic).sort(rank);
  if (organic.length) return { product: organic[0], note: null, status: "added" };

  const wantedOrganic = isOrganic(item.name) || candidates.some(productIsOrganic);
  const danish = available.filter(productIsDanish).sort(rank);
  if (danish.length) {
    return {
      product: danish[0],
      note: wantedOrganic ? "Dansk — øko-udgaven er udsolgt" : null,
      status: "added",
    };
  }

  if (!wantedOrganic || isHousehold(item)) {
    const any = [...available].sort(rank)[0];
    if (any) return { product: any, note: null, status: "added" };
  }

  return {
    product: null,
    note: wantedOrganic
      ? "Hverken øko- eller dansk udgave er på lager"
      : "Udsolgt",
    status: "unavailable",
  };
}

/**
 * Lægger varerne i nemlig-kurven. Nemlig's AddToBasket sætter et absolut
 * antal, så kurven læses først, og antallet sættes kun nogensinde op — aldrig
 * ned. Værktøjet kan derfor ikke fjerne noget, brugeren selv har lagt i kurven.
 */
export async function addItemsToBasket(items: BasketRequestItem[]): Promise<BasketItemResult[]> {
  if (items.length > MAX_ITEMS) throw new Error(`Højst ${MAX_ITEMS} varer ad gangen.`);
  const clean = items.map((i) => ({
    ...i,
    quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number(i.quantity) || 1))),
  }));

  const nemlig = await connect();
  const basket = await nemlig.getJson<RawBasket>("/webapi/basket/GetBasket");
  const inBasket = basketQuantities(basket);
  const results: BasketItemResult[] = [];

  for (const item of clean) {
    try {
      const { product, note, status } = await resolveProduct(nemlig, basket, item);
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
      if (!product) {
        results.push({ requestedName: item.name, status, note, chosen: null, quantity: 0 });
        continue;
      }

      const chosen = {
        productId: product.Id,
        name: product.Name,
        description: product.Description ?? "",
        price: product.Price,
        isOrganic: productIsOrganic(product),
        isDanish: productIsDanish(product),
        offer: describeOffer(product.Campaign),
      };
      const existing = inBasket.get(product.Id) ?? 0;
      if (existing >= item.quantity) {
        results.push({ requestedName: item.name, status: "already", note, chosen, quantity: existing });
        continue;
      }

      const updated = await nemlig.postJson<RawBasket>("/webapi/basket/AddToBasket", {
        ProductId: product.Id,
        Quantity: item.quantity,
        AffectPartialQuantity: false,
        DisableQuantityValidation: false,
      });
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
      const now = basketQuantities(updated).get(product.Id) ?? item.quantity;
      inBasket.set(product.Id, now);
      results.push({ requestedName: item.name, status: "added", note, chosen, quantity: now });
    } catch (error) {
      results.push({
        requestedName: item.name,
        status: "error",
        note: error instanceof Error ? error.message : "Ukendt fejl",
        chosen: null,
        quantity: 0,
      });
    }
  }
  return results;
}
