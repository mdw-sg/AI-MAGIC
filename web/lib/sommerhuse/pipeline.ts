import { getKnownUrls, markMissingAsInactive, recordRefreshRun, upsertListing } from "./db";
import { discoverHomeUrls, fetchHomeListings } from "./sources/home";
import { discoverNyboligUrls, fetchNyboligListings } from "./sources/nybolig";
import { discoverDanboligUrls, fetchDanboligListings } from "./sources/danbolig";
import { discoverEdcUrls, fetchEdcListings } from "./sources/edc";
import { discoverEstateUrls, fetchEstateListings } from "./sources/estate";
import type { ScrapedListing, Source } from "./types";

type SourceConfig = {
  source: Source;
  discover: () => Promise<string[]>;
  fetchMany: (urls: string[]) => Promise<{ listings: ScrapedListing[]; errors: number }>;
};

const SOURCES: SourceConfig[] = [
  { source: "home", discover: discoverHomeUrls, fetchMany: fetchHomeListings },
  { source: "nybolig", discover: discoverNyboligUrls, fetchMany: fetchNyboligListings },
  { source: "danbolig", discover: discoverDanboligUrls, fetchMany: fetchDanboligListings },
  { source: "edc", discover: discoverEdcUrls, fetchMany: fetchEdcListings },
  { source: "estate", discover: discoverEstateUrls, fetchMany: fetchEstateListings },
];

export type SourceRunResult = {
  source: Source;
  status: "ok" | "error";
  listingsFound: number;
  newListings: number;
  errorMessage: string | null;
};

async function runSource(config: SourceConfig): Promise<SourceRunResult> {
  const startedAt = new Date().toISOString();
  try {
    const urls = await config.discover();
    const known = getKnownUrls(config.source);
    const newUrls = urls.filter((u) => !known.has(u));

    const { listings } = await config.fetchMany(newUrls);
    for (const l of listings) {
      upsertListing(l);
    }
    // Genopfrisk last_seen_at for allerede kendte, stadig aktive URL'er ved
    // at behandle den fulde liste som "set nu" (upsertListing rammer kun de
    // nyhentede, så markMissingAsInactive skal have hele det aktuelle sæt).
    markMissingAsInactive(config.source, urls);

    recordRefreshRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      source: config.source,
      status: "ok",
      listingsFound: urls.length,
      newListings: listings.length,
      errorMessage: null,
    });

    return {
      source: config.source,
      status: "ok",
      listingsFound: urls.length,
      newListings: listings.length,
      errorMessage: null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    recordRefreshRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      source: config.source,
      status: "error",
      listingsFound: 0,
      newListings: 0,
      errorMessage,
    });
    return {
      source: config.source,
      status: "error",
      listingsFound: 0,
      newListings: 0,
      errorMessage,
    };
  }
}

export async function runRefresh(): Promise<SourceRunResult[]> {
  const results: SourceRunResult[] = [];
  for (const config of SOURCES) {
    // Kilderne køres sekventielt (ikke i parallel) for at holde det samlede
    // antal samtidige forbindelser på tværs af tre forskellige sites lavt.
    results.push(await runSource(config));
  }
  return results;
}
