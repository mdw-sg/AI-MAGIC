import { politeFetch } from "../fetchPolite";
import { fetchSitemapUrls } from "../sitemap";
import { mapWithConcurrency } from "../concurrency";
import type { ScrapedListing } from "../types";

// edc.dk har ingen JSON-LD på annoncesiderne. I stedet er sagens fulde data
// indlejret som et almindeligt <script type="application/json">-blok med
// felter som caseNumber/price/livingArea/areaLand/geoCoordinates direkte —
// faktisk renere at parse end JSON-LD, når man først har fundet den rigtige
// blok blandt de ~14 andre (formular-konfiguration m.m.) på siden.
const SITEMAP_URL = "https://www.edc.dk/sitemap-cases-1.xml";
const CONCURRENCY = 4;

export async function discoverEdcUrls(): Promise<string[]> {
  const all = await fetchSitemapUrls(SITEMAP_URL);
  return all.filter((url) => url.includes("/alle-boliger/sommerhus/"));
}

type EdcCase = {
  caseNumber?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  description?: string;
  livingArea?: { value?: number };
  areaLand?: { value?: number };
  price?: { value?: number };
  rooms?: { value?: number };
  geoCoordinates?: { latitude?: number; longitude?: number };
  images?: { sources?: { src?: string }[] }[];
  propertyFacts?: { facts?: { type?: string; value?: string }[] }[];
};

function extractCaseData(html: string): EdcCase | null {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]) as EdcCase;
      if (parsed.caseNumber && parsed.price) return parsed;
    } catch {
      // ikke den rette blok / ikke gyldig JSON — prøv næste
    }
  }
  return null;
}

function extractYearBuilt(data: EdcCase): number | null {
  const fact = data.propertyFacts?.[0]?.facts?.find((f) => f.type === "yearBuilt");
  if (!fact?.value) return null;
  const year = parseInt(fact.value, 10);
  return Number.isFinite(year) ? year : null;
}

function largestImage(data: EdcCase): string | null {
  const sources = data.images?.[0]?.sources;
  if (!sources || sources.length === 0) return null;
  return sources[sources.length - 1].src ?? null;
}

export async function fetchEdcListing(url: string): Promise<ScrapedListing | null> {
  const html = await politeFetch(url);
  const data = extractCaseData(html);
  if (!data || !data.caseNumber) return null;

  return {
    id: `edc:${data.caseNumber}`,
    source: "edc",
    url,
    address: data.address ?? null,
    postalCode: data.zipCode ?? null,
    city: data.city ?? null,
    // "|| null" med vilje frem for "?? null": edc.dk returnerer 0 for ukendte
    // tal (fx grundareal på lejlighedslignende sommerhuse), og 0 er aldrig en
    // reel værdi for disse felter — skal behandles som "ukendt", ikke "nul".
    price: data.price?.value || null,
    sizeM2: data.livingArea?.value || null,
    lotSizeM2: data.areaLand?.value || null,
    rooms: data.rooms?.value || null,
    yearBuilt: extractYearBuilt(data),
    description: data.description ?? null,
    imageUrl: largestImage(data),
    latitude: data.geoCoordinates?.latitude ?? null,
    longitude: data.geoCoordinates?.longitude ?? null,
    datePosted: null,
  };
}

export async function fetchEdcListings(
  urls: string[]
): Promise<{ listings: ScrapedListing[]; errors: number }> {
  let errors = 0;
  const results = await mapWithConcurrency(urls, CONCURRENCY, async (url) => {
    try {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
      return await fetchEdcListing(url);
    } catch {
      errors++;
      return null;
    }
  });
  return { listings: results.filter((l): l is ScrapedListing => l != null), errors };
}
