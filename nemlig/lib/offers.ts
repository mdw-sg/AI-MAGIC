import { connect } from "./client";
import { isOrganic } from "./preferences";
import { readJsonFile, writeJsonFile } from "./storage";

const CACHE_FILE = "offers.json";

export type Offer = {
  productId: string;
  name: string;
  description: string;
  /** Nemlig's egen sektion på tilbudssiden, fx "Frugt og grønt". */
  section: string;
  price: number;
  originalPrice: number | null;
  savings: number | null;
  campaignText: string | null;
  isOrganic: boolean;
  isDanish: boolean;
  soldOut: boolean;
};

export type OfferCache = { fetchedAt: string; offers: Offer[] };

type RawBffProduct = {
  id: string;
  title: string;
  description?: string;
  price: number;
  priceOriginal?: number | null;
  priceDiscount?: number | null;
  certificates?: { type?: string; text?: string }[];
  campaignLines?: { text?: string }[];
  availability?: { type?: string };
};

type RawBffPage = {
  pageContent?: { contentType?: string; header?: { title?: string }; products?: RawBffProduct[] }[];
};

/** øre → kroner */
const kr = (ore: number) => Math.round(ore) / 100;

export function getOfferCache(): OfferCache | null {
  return readJsonFile<OfferCache>(CACHE_FILE);
}

/**
 * Henter nemlig's tilbudsside. Priserne afhænger af leveringsområde og
 * -tidspunkt, så tidspunktet fra brugerens kurv sendes med.
 */
export async function syncOffers(): Promise<OfferCache> {
  const nemlig = await connect();
  const basket = await nemlig.getJson<{ DeliveryTimeSlot?: { Id?: string | number } | null }>(
    "/webapi/basket/GetBasket"
  );
  const params = new URLSearchParams({
    path: "/tilbud",
    timeslotId: String(basket.DeliveryTimeSlot?.Id ?? ""),
  });
  const page = await nemlig.getJson<RawBffPage>(
    `/productbff/api/web/page?${params}`,
    nemlig.searchOrigin
  );

  const byId = new Map<string, Offer>();
  for (const section of page.pageContent ?? []) {
    if (section.contentType !== "ProductList") continue;
    for (const p of section.products ?? []) {
      // "God pris"-varer uden rabat eller kampagne er ikke rigtige tilbud.
      const campaignText = p.campaignLines?.find((l) => l.text)?.text ?? null;
      if (p.priceDiscount == null && !campaignText) continue;
      if (byId.has(p.id)) continue;
      const certificates = p.certificates ?? [];
      byId.set(p.id, {
        productId: p.id,
        name: p.title,
        description: p.description ?? "",
        section: section.header?.title ?? "",
        price: kr(p.price),
        originalPrice: p.priceOriginal != null ? kr(p.priceOriginal) : null,
        savings: p.priceDiscount != null ? kr(p.priceDiscount) : null,
        campaignText,
        isOrganic: isOrganic(p.title) || certificates.some((c) => /organic/i.test(c.type ?? "")),
        isDanish: certificates.some((c) => c.type === "dkProduced" || c.type === "dkOrganic"),
        soldOut: p.availability?.type === "SoldOut",
      });
    }
  }

  const cache: OfferCache = { fetchedAt: new Date().toISOString(), offers: [...byId.values()] };
  writeJsonFile(CACHE_FILE, cache);
  return cache;
}
