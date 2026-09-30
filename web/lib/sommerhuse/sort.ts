import type { Listing, MatchResult } from "./types";

export type SortKey =
  | "score"
  | "price_asc"
  | "price_desc"
  | "size_desc"
  | "lot_desc"
  | "date_desc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Bedste match" },
  { value: "date_desc", label: "Nyeste annonce" },
  { value: "price_asc", label: "Pris (lav → høj)" },
  { value: "price_desc", label: "Pris (høj → lav)" },
  { value: "size_desc", label: "Boligstørrelse (størst)" },
  { value: "lot_desc", label: "Grundstørrelse (størst)" },
];

export const DEFAULT_SORT: SortKey = "score";

export function parseSortKey(value: string | undefined): SortKey {
  return SORT_OPTIONS.some((o) => o.value === value) ? (value as SortKey) : DEFAULT_SORT;
}

// Manglende værdier placeres altid sidst, uanset sorteringsretning, så en
// bolig ikke "vinder" en sortering bare fordi vi ikke kender dens tal.
function compareNullsLast(a: number | null, b: number | null, ascending: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return ascending ? a - b : b - a;
}

export function sortItems<T extends { listing: Listing; match: MatchResult }>(
  items: T[],
  sort: SortKey
): T[] {
  const sorted = [...items];
  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => compareNullsLast(a.listing.price, b.listing.price, true));
      break;
    case "price_desc":
      sorted.sort((a, b) => compareNullsLast(a.listing.price, b.listing.price, false));
      break;
    case "size_desc":
      sorted.sort((a, b) => compareNullsLast(a.listing.sizeM2, b.listing.sizeM2, false));
      break;
    case "lot_desc":
      sorted.sort((a, b) => compareNullsLast(a.listing.lotSizeM2, b.listing.lotSizeM2, false));
      break;
    case "date_desc":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.listing.datePosted ? Date.parse(a.listing.datePosted) : null,
          b.listing.datePosted ? Date.parse(b.listing.datePosted) : null,
          false
        )
      );
      break;
    case "score":
    default:
      sorted.sort((a, b) => b.match.score - a.match.score);
      break;
  }
  return sorted;
}
