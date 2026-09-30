export type Source = "home" | "nybolig" | "danbolig" | "edc" | "estate";

export type Listing = {
  id: string;
  source: Source;
  url: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  price: number | null;
  sizeM2: number | null;
  lotSizeM2: number | null;
  rooms: number | null;
  yearBuilt: number | null;
  description: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  datePosted: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  favoritedAt: string | null;
};

export type ScrapedListing = Omit<
  Listing,
  "firstSeenAt" | "lastSeenAt" | "isActive" | "favoritedAt"
>;

export type RefreshRunStatus = "ok" | "error";

export type RefreshRun = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  source: Source;
  status: RefreshRunStatus;
  listingsFound: number | null;
  newListings: number | null;
  errorMessage: string | null;
};

export type MatchResult = {
  score: number;
  reason: string;
  checkedManually: string[];
};
