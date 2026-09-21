import type { Listing, MatchResult } from "./types";

// Sorteringskriterier fra "sommerhus_soege_og_segmenteringskriterier.md" (2026-09-21).
// Kun de forhold, der reelt kan udledes af de scrapede annoncedata (region,
// afstand til København, grundstørrelse), indgår i scoren. De øvrige
// højt prioriterede kriterier (støj, naboafstand, vandrobusthed, luft/miljø,
// radon, spildevand, jura) kræver besigtigelse/opslag i officielle kort og
// kan ikke afgøres fra en salgsannonce alene — de listes i stedet som
// "kræver manuel vurdering" pr. bolig, jf. kriteriedokumentets egen pointe
// om at radon fx er et due-diligence-kriterium, ikke et geografisk fravalg.

const COPENHAGEN = { lat: 55.6761, lon: 12.5683 };

// Første udkast til de 12 prioriterede mikroområder, mappet til postnumre og
// stedord til fritekst-match på adresse/by. Stjerner er kopieret fra
// områdelisten. Dette er en tilnærmelse — bør efterjusteres, hvis et postnr.
// viser sig at dække et område forkert.
type Area = {
  name: string;
  stars: number;
  postalCodes: string[];
  keywords: string[];
};

const PRIORITY_AREAS: Area[] = [
  {
    name: "Veddinge Bakker / højtliggende Fårevejle",
    stars: 5,
    postalCodes: ["4540"],
    keywords: ["fårevejle", "veddinge"],
  },
  {
    name: "Dianalund – Tersløse – Niløse",
    stars: 5,
    postalCodes: ["4293"],
    keywords: ["dianalund", "tersløse", "niløse"],
  },
  {
    name: "Bjergsted – højtliggende dele omkring Jyderup",
    stars: 5,
    postalCodes: ["4450"],
    keywords: ["bjergsted", "jyderup"],
  },
  {
    name: "Bjergsted – Svebølle-korridoren",
    stars: 4.5,
    postalCodes: ["4470"],
    keywords: ["svebølle"],
  },
  {
    name: "Bjernede – Slaglille – nord for Sorø",
    stars: 4.5,
    postalCodes: ["4180"],
    keywords: ["bjernede", "slaglille", "sorø"],
  },
  {
    name: "St. Merløse – Ugerløse",
    stars: 4.5,
    postalCodes: ["4370", "4350"],
    keywords: ["store merløse", "st. merløse", "ugerløse"],
  },
  {
    name: "Mørkøv – Knabstrup og opland",
    stars: 4,
    postalCodes: ["4440"],
    keywords: ["mørkøv", "knabstrup"],
  },
  {
    name: "Jukkerup – Undløse",
    stars: 4,
    postalCodes: ["4340"],
    keywords: ["jukkerup", "undløse"],
  },
  {
    name: "Tølløse – Ågerup og landzonen omkring",
    stars: 4,
    postalCodes: ["4340"],
    keywords: ["tølløse", "ågerup"],
  },
  {
    name: "Højtliggende centrale Tuse Næs",
    stars: 3.5,
    postalCodes: ["4300"],
    keywords: ["tuse næs", "tuse"],
  },
  {
    name: "Højtliggende indre Odsherred generelt",
    stars: 3.5,
    postalCodes: ["4500", "4560", "4581", "4534", "4591"],
    keywords: ["odsherred", "nykøbing sj", "rørvig", "hørve", "asnæs"],
  },
  {
    name: "Øvrige Sorø-landområder mod Ringsted",
    stars: 3.5,
    postalCodes: ["4180", "4100"],
    keywords: ["sorø", "ringsted"],
  },
];

const MANUAL_CHECKS = [
  "Ro og støj: undersøg reel afstand til veje, jernbane, lufthavn, industri og andre støjkilder på stedet",
  "Privatliv/naboafstand: tjek reel afstand til naboers opholdsareal og fremtidige udstykningsmuligheder",
  "Vandrobusthed og terræn: vurder om grunden ligger højt/tørt og uden for bluespot/oversvømmelsesrisiko",
  "Luft, miljø og jord: undersøg nærhed til landbrug/industri og evt. jordforurening (V1/V2)",
  "Radon: bør måles konkret hvis området har forhøjet modelleret risiko — ikke et automatisk fravalg",
  "Spildevand/vandforsyning: afklar om der er offentlig kloak eller privat anlæg/brønd",
  "Jura/BBR: tjek BBR mod faktiske bygninger, servitutter, lokalplan og grundejerforening",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function matchArea(listing: Listing): Area | null {
  const postal = listing.postalCode?.trim();
  const cityAndAddress = normalize(`${listing.city ?? ""} ${listing.address ?? ""}`);
  for (const area of PRIORITY_AREAS) {
    if (postal && area.postalCodes.includes(postal)) return area;
    if (area.keywords.some((kw) => cityAndAddress.includes(normalize(kw)))) {
      return area;
    }
  }
  return null;
}

function areaScore(area: Area | null): { points: number; reason: string } {
  if (!area) {
    return {
      points: 0,
      reason: "Ligger uden for de 12 prioriterede mikroområder",
    };
  }
  const points = (area.stars / 5) * 40;
  return {
    points,
    reason: `I prioriteret område "${area.name}" (${area.stars}★)`,
  };
}

function distanceScore(listing: Listing): { points: number; reason: string } {
  if (listing.latitude == null || listing.longitude == null) {
    return { points: 0, reason: "Afstand til København ukendt (ingen koordinater)" };
  }
  const straightLineKm = haversineKm(COPENHAGEN, {
    lat: listing.latitude,
    lon: listing.longitude,
  });
  // Grov køretidsestimering: lige linje * vejfaktor / gennemsnitshastighed.
  // Ikke en reel rutning — kun til grov sortering.
  const estimatedMinutes = Math.round(((straightLineKm * 1.3) / 70) * 60);
  let points: number;
  if (estimatedMinutes <= 70 && estimatedMinutes >= 45) points = 20;
  else if (estimatedMinutes < 45) points = 16;
  else if (estimatedMinutes <= 75) points = 18;
  else if (estimatedMinutes <= 90) points = 8;
  else points = 0;
  return {
    points,
    reason: `Ca. ${estimatedMinutes} min. (ca. ${Math.round(straightLineKm)} km) fra København (estimeret, ikke rutet)`,
  };
}

function lotSizeScore(listing: Listing): { points: number; reason: string } {
  const m2 = listing.lotSizeM2;
  if (m2 == null) {
    return { points: 0, reason: "Grundstørrelse ukendt" };
  }
  let points: number;
  if (m2 >= 2000 && m2 <= 10000) points = 20;
  else if (m2 >= 1500) points = 16;
  else if (m2 > 10000) points = 14;
  else points = Math.max(0, Math.round((m2 / 1500) * 10));
  return {
    points,
    reason: `Grund på ${Math.round(m2).toLocaleString("da-DK")} m²`,
  };
}

export function matchListing(listing: Listing): MatchResult {
  const area = matchArea(listing);
  const areaResult = areaScore(area);
  const distanceResult = distanceScore(listing);
  const lotResult = lotSizeScore(listing);

  const score = Math.round(
    ((areaResult.points + distanceResult.points + lotResult.points) / 80) * 100
  );

  const reason = [areaResult.reason, distanceResult.reason, lotResult.reason].join(" · ");

  return {
    score,
    reason,
    checkedManually: MANUAL_CHECKS,
  };
}
