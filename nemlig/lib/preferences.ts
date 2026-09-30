// Brugerens egne regler for, hvad der skal og ikke skal i kurven. Reglerne
// matcher på varenavn, fordi nemlig ofte har flere varenumre for samme vare
// (størrelser, øko/ikke-øko, sæsonvarianter).

export type PinnedStaple = { label: string; match: RegExp };

/** Varer, der altid regnes som standardvarer, uanset hvor ofte de købes. */
export const PINNED_STAPLES: PinnedStaple[] = [
  { label: "Mælk", match: /^(sødmælk|letmælk|minimælk|skummetmælk|gårdmælk)/i },
  { label: "Broccoli", match: /^broccoli/i },
  { label: "Forårsløg", match: /^forårsløg/i },
  { label: "Ost", match: /ost.* i skiver|^ost i skiver/i },
  { label: "Iceberg salat", match: /^iceberg/i },
  { label: "Blomkål", match: /^blomkål/i },
  { label: "Snackpeber", match: /^snackpeber/i },
];

const CANDY_NAME =
  /slik|vingummi|lakrids|chokolade|bolsje|skumfidus|guldbamse|click mix|stjerne mix|favorit mix|familieguf|\bsour\b/i;

/**
 * Slik (og resten af nemlig's "Kiosk"-kategori) foreslås kun, når det er på
 * tilbud — aldrig som fast standardvare.
 */
export function isOnlyWhenOnOffer(product: { name: string; mainGroup: string }): boolean {
  return product.mainGroup === "Kiosk" || CANDY_NAME.test(product.name);
}

// "øko" skal stå som eget ord — \b virker ikke ved æ/ø/å i JavaScript.
const ORGANIC = /(^|[^a-zæøå])øko(?![a-zæøå])/i;

/** Alle varer skal så vidt muligt være økologiske. */
export function isOrganic(name: string): boolean {
  return ORGANIC.test(name);
}

/**
 * Nøgle, der samler varianter af samme vare, fx "Blomkål" og "Blomkål øko.",
 * så øko-udgaven kan vælges frem for den konventionelle.
 */
export function productKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[^a-zæøå])øko(?![a-zæøå])\.?/g, " ")
    .replace(/[^a-zæøå0-9%]+/g, " ")
    .trim();
}
