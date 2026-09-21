import { politeFetch } from "../fetchPolite";
import { fetchSitemapUrls } from "../sitemap";
import { mapWithConcurrency } from "../concurrency";
import { decodeHtmlEntities, parseNumber } from "../entities";
import type { ScrapedListing } from "../types";

const SITEMAP_URL = "https://www.nybolig.dk/sitemaps/nybolig/cases-vacationhousing.xml";
const CONCURRENCY = 4;

export async function discoverNyboligUrls(): Promise<string[]> {
  return fetchSitemapUrls(SITEMAP_URL);
}

function extractGeo(html: string): { lat: number | null; lon: number | null } {
  const match = html.match(
    /data-longitude="([\d.-]+)"\s+data-latitude="([\d.-]+)"/
  );
  return match
    ? { lat: parseFloat(match[2]), lon: parseFloat(match[1]) }
    : { lat: null, lon: null };
}

function extractLotSizeM2(html: string): number | null {
  const match = html.match(
    /Grundst&#248;rrelse:\s*<\/span>\s*<span[^>]*>([\d.,]+)\s*m/
  );
  return match ? parseNumber(match[1]) : null;
}

function extractJsonLd(html: string): unknown | null {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function fetchNyboligListing(url: string): Promise<ScrapedListing | null> {
  const html = await politeFetch(url);
  const doc = extractJsonLd(html) as
    | {
        datePosted?: string;
        mainEntity?: {
          description?: string;
          yearBuilt?: number;
          numberOfRooms?: number;
          address?: { streetAddress?: string; addressLocality?: string; postalCode?: string };
          offers?: { price?: string; Price?: string };
          floorSize?: { value?: number };
          primaryImageOfPage?: { url?: string };
        };
      }
    | null;

  const entity = doc?.mainEntity;
  if (!entity) return null;

  const priceRaw = entity.offers?.Price ?? entity.offers?.price;
  const geo = extractGeo(html);
  const slug = url.split("/").filter(Boolean).pop() ?? url;

  return {
    id: `nybolig:${slug}`,
    source: "nybolig",
    url,
    address: entity.address?.streetAddress
      ? decodeHtmlEntities(entity.address.streetAddress)
      : null,
    postalCode: entity.address?.postalCode ?? null,
    city: entity.address?.addressLocality
      ? decodeHtmlEntities(entity.address.addressLocality)
      : null,
    price: priceRaw ? parseNumber(priceRaw) : null,
    sizeM2: entity.floorSize?.value ?? null,
    lotSizeM2: extractLotSizeM2(html),
    rooms: entity.numberOfRooms ?? null,
    yearBuilt: entity.yearBuilt ?? null,
    description: entity.description ? decodeHtmlEntities(entity.description) : null,
    imageUrl: entity.primaryImageOfPage?.url ?? null,
    latitude: geo.lat,
    longitude: geo.lon,
    datePosted: doc?.datePosted ?? null,
  };
}

export async function fetchNyboligListings(
  urls: string[]
): Promise<{ listings: ScrapedListing[]; errors: number }> {
  let errors = 0;
  const results = await mapWithConcurrency(urls, CONCURRENCY, async (url) => {
    try {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
      return await fetchNyboligListing(url);
    } catch {
      errors++;
      return null;
    }
  });
  return { listings: results.filter((l): l is ScrapedListing => l != null), errors };
}
