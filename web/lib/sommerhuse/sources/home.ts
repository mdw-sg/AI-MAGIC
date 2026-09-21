import { politeFetch } from "../fetchPolite";
import { fetchSitemapUrls } from "../sitemap";
import { mapWithConcurrency } from "../concurrency";
import { parseNumber } from "../entities";
import type { ScrapedListing } from "../types";

const SITEMAP_URL = "https://home.dk/sitemaps/case.xml";
const CONCURRENCY = 4;

export async function discoverHomeUrls(): Promise<string[]> {
  const all = await fetchSitemapUrls(SITEMAP_URL);
  return all.filter((url) => url.includes("/salg/sommerhuse/"));
}

function extractLotSizeM2(html: string): number | null {
  const match = html.match(
    /class="h1"[^>]*>([\d.,]+)\s*m2<\/span><span class="base-usp__name"[^>]*>Grundareal<\/span>/
  );
  return match ? parseNumber(match[1]) : null;
}

function extractJsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks
    .map((b) => {
      try {
        return JSON.parse(b[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function fetchHomeListing(url: string): Promise<ScrapedListing | null> {
  const html = await politeFetch(url);
  const docs = extractJsonLd(html);
  const graph = docs.flatMap((d) =>
    d && typeof d === "object" && "@graph" in d
      ? (d as { "@graph": unknown[] })["@graph"]
      : []
  );
  const listing = graph.find(
    (n) => n && typeof n === "object" && (n as { "@type"?: string })["@type"] === "RealEstateListing"
  ) as
    | {
        name?: string;
        description?: string;
        datePosted?: string;
        image?: string[];
        offers?: {
          price?: number;
          itemOffered?: {
            yearBuilt?: string;
            numberOfRooms?: number;
            address?: { streetAddress?: string; addressLocality?: string; postalCode?: string };
            geo?: { latitude?: number | string; longitude?: number | string };
            accommodationFloorPlan?: { floorSize?: { value?: number } };
          };
        };
      }
    | undefined;

  if (!listing) return null;

  const item = listing.offers?.itemOffered;
  const sagMatch = url.match(/sag-([a-zA-Z0-9]+)/);
  const id = `home:${sagMatch ? sagMatch[1] : url}`;

  const postalCode = item?.address?.postalCode ?? null;
  const city = item?.address?.addressLocality ?? null;
  // home.dk's streetAddress allerede indeholder ", <postnr> <by>" i halen —
  // fjern den, så den ikke gentages ved siden af postalCode/city-felterne.
  const rawAddress = item?.address?.streetAddress ?? null;
  const address =
    rawAddress && postalCode && city
      ? rawAddress.replace(new RegExp(`,?\\s*${postalCode}\\s+${city}\\s*$`), "").trim()
      : rawAddress;

  return {
    id,
    source: "home",
    url,
    address: address || null,
    postalCode,
    city,
    price: listing.offers?.price ?? null,
    sizeM2: item?.accommodationFloorPlan?.floorSize?.value ?? null,
    lotSizeM2: extractLotSizeM2(html),
    rooms: item?.numberOfRooms ?? null,
    yearBuilt: item?.yearBuilt ? parseInt(item.yearBuilt, 10) : null,
    description: listing.description ?? null,
    imageUrl: listing.image?.[0] ?? null,
    latitude: item?.geo?.latitude != null ? Number(item.geo.latitude) : null,
    longitude: item?.geo?.longitude != null ? Number(item.geo.longitude) : null,
    datePosted: listing.datePosted ?? null,
  };
}

export async function fetchHomeListings(
  urls: string[]
): Promise<{ listings: ScrapedListing[]; errors: number }> {
  let errors = 0;
  const results = await mapWithConcurrency(urls, CONCURRENCY, async (url) => {
    try {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
      return await fetchHomeListing(url);
    } catch {
      errors++;
      return null;
    }
  });
  return { listings: results.filter((l): l is ScrapedListing => l != null), errors };
}
