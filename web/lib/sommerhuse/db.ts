import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Listing, RefreshRun, ScrapedListing, Source } from "./types";

const DB_PATH = join(process.cwd(), "data", "sommerhuse.sqlite3");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id            TEXT PRIMARY KEY,
      source        TEXT NOT NULL,
      url           TEXT NOT NULL UNIQUE,
      address       TEXT,
      postal_code   TEXT,
      city          TEXT,
      price         INTEGER,
      size_m2       REAL,
      lot_size_m2   REAL,
      rooms         INTEGER,
      year_built    INTEGER,
      description   TEXT,
      image_url     TEXT,
      latitude      REAL,
      longitude     REAL,
      date_posted   TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      favorited_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_listings_favorited ON listings(favorited_at);
    CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);

    CREATE TABLE IF NOT EXISTS refresh_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at      TEXT NOT NULL,
      finished_at     TEXT,
      source          TEXT NOT NULL,
      status          TEXT NOT NULL,
      listings_found  INTEGER,
      new_listings    INTEGER,
      error_message   TEXT
    );
  `);
  return db;
}

type ListingRow = {
  id: string;
  source: Source;
  url: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  price: number | null;
  size_m2: number | null;
  lot_size_m2: number | null;
  rooms: number | null;
  year_built: number | null;
  description: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  date_posted: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: number;
  favorited_at: string | null;
};

function rowToListing(row: ListingRow): Listing {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    price: row.price,
    sizeM2: row.size_m2,
    lotSizeM2: row.lot_size_m2,
    rooms: row.rooms,
    yearBuilt: row.year_built,
    description: row.description,
    imageUrl: row.image_url,
    latitude: row.latitude,
    longitude: row.longitude,
    datePosted: row.date_posted,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isActive: row.is_active === 1,
    favoritedAt: row.favorited_at,
  };
}

export function upsertListing(listing: ScrapedListing): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO listings (
        id, source, url, address, postal_code, city, price, size_m2, lot_size_m2,
        rooms, year_built, description, image_url, latitude, longitude, date_posted,
        first_seen_at, last_seen_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        address = excluded.address,
        postal_code = excluded.postal_code,
        city = excluded.city,
        price = excluded.price,
        size_m2 = excluded.size_m2,
        lot_size_m2 = excluded.lot_size_m2,
        rooms = excluded.rooms,
        year_built = excluded.year_built,
        description = excluded.description,
        image_url = excluded.image_url,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        date_posted = excluded.date_posted,
        last_seen_at = excluded.last_seen_at,
        is_active = 1`
    )
    .run(
      listing.id,
      listing.source,
      listing.url,
      listing.address,
      listing.postalCode,
      listing.city,
      listing.price,
      listing.sizeM2,
      listing.lotSizeM2,
      listing.rooms,
      listing.yearBuilt,
      listing.description,
      listing.imageUrl,
      listing.latitude,
      listing.longitude,
      listing.datePosted,
      now,
      now
    );
}

export function markMissingAsInactive(source: Source, seenUrls: string[]): number {
  const database = getDb();
  const placeholders = seenUrls.map(() => "?").join(",") || "''";
  const result = database
    .prepare(
      `UPDATE listings SET is_active = 0
       WHERE source = ? AND is_active = 1 AND url NOT IN (${placeholders})`
    )
    .run(source, ...seenUrls);
  return Number(result.changes);
}

export function getKnownUrls(source: Source): Set<string> {
  const rows = getDb()
    .prepare(`SELECT url FROM listings WHERE source = ?`)
    .all(source) as { url: string }[];
  return new Set(rows.map((r) => r.url));
}

export function getAllListings(): Listing[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM listings WHERE is_active = 1 ORDER BY date_posted DESC, last_seen_at DESC`
    )
    .all() as ListingRow[];
  return rows.map(rowToListing);
}

export function toggleFavorite(id: string): Listing | null {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM listings WHERE id = ?`)
    .get(id) as ListingRow | undefined;
  if (!row) return null;
  const newValue = row.favorited_at ? null : new Date().toISOString();
  database
    .prepare(`UPDATE listings SET favorited_at = ? WHERE id = ?`)
    .run(newValue, id);
  return rowToListing({ ...row, favorited_at: newValue });
}

export function recordRefreshRun(run: {
  startedAt: string;
  finishedAt: string;
  source: Source;
  status: "ok" | "error";
  listingsFound: number;
  newListings: number;
  errorMessage: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO refresh_runs (
        started_at, finished_at, source, status, listings_found, new_listings, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      run.startedAt,
      run.finishedAt,
      run.source,
      run.status,
      run.listingsFound,
      run.newListings,
      run.errorMessage
    );
}

export function getLatestRefreshRuns(): RefreshRun[] {
  const rows = getDb()
    .prepare(
      `SELECT r.* FROM refresh_runs r
       INNER JOIN (
         SELECT source, MAX(id) AS max_id FROM refresh_runs GROUP BY source
       ) latest ON latest.source = r.source AND latest.max_id = r.id
       ORDER BY r.source ASC`
    )
    .all() as {
    id: number;
    started_at: string;
    finished_at: string | null;
    source: Source;
    status: "ok" | "error";
    listings_found: number | null;
    new_listings: number | null;
    error_message: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    source: r.source,
    status: r.status,
    listingsFound: r.listings_found,
    newListings: r.new_listings,
    errorMessage: r.error_message,
  }));
}

export function isRefreshInProgress(): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM refresh_runs
       WHERE finished_at IS NULL AND started_at > datetime('now', '-10 minutes')`
    )
    .get() as { c: number };
  return row.c > 0;
}
