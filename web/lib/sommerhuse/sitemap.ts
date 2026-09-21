import { politeFetch } from "./fetchPolite";

export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await politeFetch(sitemapUrl);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

  if (xml.includes("<sitemapindex")) {
    // Sitemap-indeks: følg hver under-sitemap og saml resultaterne.
    const all: string[] = [];
    for (const sub of locs) {
      all.push(...(await fetchSitemapUrls(sub)));
    }
    return all;
  }

  return locs;
}
