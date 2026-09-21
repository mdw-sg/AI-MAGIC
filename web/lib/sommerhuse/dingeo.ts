import type { Listing } from "./types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    // æ/ø/å har ingen NFD-dekomponering (de er selvstændige bogstaver, ikke
    // accenttegn) og skal derfor omskrives eksplicit. home.dk's egne
    // annonce-URL'er bekræfter ø→oe-konventionen (fx "Høll" -> "hoell"),
    // som bruges her som bedste bud for dingeo.dk's slug-format.
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Gadeniveau-oversigt på dingeo.dk. Mønsteret er bekræftet via rigtige
// indekserede URL'er (dingeo.dk er bag Cloudflare og kan ikke selv
// verificeres automatisk fra serveren) — kan vise sig at have et
// husnummer-underniveau, som i så fald bør tilføjes her.
export function buildDingeoUrl(listing: Listing): string | null {
  if (!listing.postalCode || !listing.city || !listing.address) return null;
  const street = listing.address.split(",")[0]?.trim();
  if (!street) return null;
  const streetSlug = slugify(street.replace(/\s*\d+[a-zA-Z]?\s*$/, ""));
  const citySlug = slugify(listing.city);
  if (!streetSlug || !citySlug) return null;
  return `https://www.dingeo.dk/oversigt/${listing.postalCode}-${citySlug}/${streetSlug}/`;
}

export function buildGoogleMapsUrl(listing: Listing): string {
  if (listing.latitude != null && listing.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`;
  }
  const query = encodeURIComponent(
    [listing.address, listing.postalCode, listing.city].filter(Boolean).join(" ")
  );
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
