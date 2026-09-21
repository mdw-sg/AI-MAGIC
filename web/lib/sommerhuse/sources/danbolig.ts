import { politeFetch } from "../fetchPolite";
import { fetchSitemapUrls } from "../sitemap";
import { mapWithConcurrency } from "../concurrency";
import { decodeHtmlEntities, parseNumber } from "../entities";
import type { ScrapedListing } from "../types";

const SITEMAP_URL = "https://danbolig.dk/sitemap.properties.xml";
const CONCURRENCY = 4;

export async function discoverDanboligUrls(): Promise<string[]> {
  const all = await fetchSitemapUrls(SITEMAP_URL);
  return all.filter((url) => url.includes("/fritidsbolig/"));
}

type JsonLdNode = Record<string, unknown> & { "@type"?: string[] };

function extractJsonLdNodes(html: string): JsonLdNode[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks
    .map((b) => {
      try {
        return JSON.parse(b[1]) as JsonLdNode;
      } catch {
        return null;
      }
    })
    .filter((n): n is JsonLdNode => n != null);
}

function findByType(nodes: JsonLdNode[], type: string): JsonLdNode | undefined {
  return nodes.find((n) => Array.isArray(n["@type"]) && n["@type"].includes(type));
}

function extractLabelValue(html: string, label: string): string | null {
  const re = new RegExp(`'label':\\s*'${label}',\\s*'value':\\s*'([^']*)'`);
  const match = html.match(re);
  return match ? match[1] : null;
}

function extractLotSizeM2(html: string): number | null {
  const match = html.match(/<td>Grundareal<\/td>\s*<td>([\d.,]+)\s*m/);
  return match ? parseNumber(match[1]) : null;
}

export async function fetchDanboligListing(url: string): Promise<ScrapedListing | null> {
  const html = await politeFetch(url);
  const nodes = extractJsonLdNodes(html);
  const product = findByType(nodes, "product");
  const listing = findByType(nodes, "RealEstateListing");
  const residence = findByType(nodes, "Residence");

  if (!product && !listing) return null;

  const offers = product?.offers as { price?: string } | undefined;
  const address = residence?.address as
    | { streetAddress?: string; postalCode?: string; addressLocality?: string }
    | undefined;
  const geo = residence?.geo as { latitude?: string; longitude?: string } | undefined;

  const boligarealRaw = extractLabelValue(html, "Boligareal");
  const rumRaw = extractLabelValue(html, "Rum");

  const idMatch = url.match(/\/fritidsbolig\/([^/]+)\/?$/);
  const id = `danbolig:${idMatch ? idMatch[1] : url}`;

  return {
    id,
    source: "danbolig",
    url,
    address: address?.streetAddress ? decodeHtmlEntities(address.streetAddress) : null,
    postalCode: address?.postalCode ?? null,
    city: address?.addressLocality ? decodeHtmlEntities(address.addressLocality) : null,
    price: offers?.price ? parseNumber(offers.price) : null,
    sizeM2: boligarealRaw ? parseNumber(boligarealRaw) : null,
    lotSizeM2: extractLotSizeM2(html),
    rooms: rumRaw ? parseInt(rumRaw, 10) || null : null,
    yearBuilt: null,
    description: product?.description
      ? decodeHtmlEntities(String(product.description))
      : null,
    imageUrl: (product?.image as string | undefined) ?? null,
    latitude: geo?.latitude != null ? parseFloat(geo.latitude) : null,
    longitude: geo?.longitude != null ? parseFloat(geo.longitude) : null,
    datePosted: (listing?.datePosted as string | undefined) ?? null,
  };
}

export async function fetchDanboligListings(
  urls: string[]
): Promise<{ listings: ScrapedListing[]; errors: number }> {
  let errors = 0;
  const results = await mapWithConcurrency(urls, CONCURRENCY, async (url) => {
    try {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
      return await fetchDanboligListing(url);
    } catch {
      errors++;
      return null;
    }
  });
  return { listings: results.filter((l): l is ScrapedListing => l != null), errors };
}
