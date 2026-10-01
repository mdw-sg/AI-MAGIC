// Brugerens egne regler for, hvad der skal og ikke skal i kurven. Reglerne
// matcher på varenavn, fordi nemlig ofte har flere varenumre for samme vare
// (størrelser, øko/ikke-øko, sæsonvarianter).

export type PinnedStaple = {
  label: string;
  /** Hvilke varenavne der tæller som denne vare. */
  match: RegExp;
  /**
   * Brugerens egen prioritering, testet mod "navn beskrivelse". Går forud for
   * øko/dansk-reglen: første mønster med en vare på lager vinder. Uden
   * prioritering bruges den almindelige regel (øko, ellers dansk).
   */
  prefer?: RegExp[];
  /** Søgeord hos nemlig, når prioriteringen dækker flere varenavne. */
  query?: string;
};

/** Varer, der altid regnes som standardvarer, uanset hvor ofte de købes. */
export const PINNED_STAPLES: PinnedStaple[] = [
  {
    label: "Mælk",
    match: /^(sødmælk|letmælk|minimælk|skummetmælk|gårdmælk)/i,
    prefer: [/naturmælk/i, /^sødmælk 25% jersey/i],
    query: "sødmælk",
  },
  { label: "Broccoli", match: /^broccoli/i },
  { label: "Forårsløg", match: /^forårsløg/i },
  { label: "Ost", match: /ost.* i skiver|^ost i skiver/i },
  { label: "Iceberg salat", match: /^iceberg/i },
  { label: "Blomkål", match: /^blomkål/i },
  { label: "Snackpeber", match: /^snackpeber/i },
  { label: "Bananer", match: /^bananer små/i },
  {
    label: "Agurk",
    match: /^agurk( |$)/i,
    prefer: [/^agurk dansk/i, /^agurk øko/i],
    query: "agurk",
  },
  { label: "Hasselnødder", match: /^hasselnødder/i, prefer: [/nordthy/i], query: "hasselnødder" },
  { label: "Babyspinat", match: /^babyspinat/i },
  { label: "Salattern", match: /^salattern/i },
  { label: "Løg", match: /^løg( |$)/i },
  { label: "Kokosmel", match: /^kokosmel/i, query: "kokosmel" },
];

/** Varer, der altid står under "Snart tid igen" i stedet for at blive standard. */
export const FORCE_DUE: RegExp[] = [/^brun farin/i];

/** Placering i brugerens prioritering (0 = førstevalg), eller Infinity. */
export function preferenceRank(
  staple: PinnedStaple,
  product: { name: string; description: string }
): number {
  const text = `${product.name} ${product.description}`;
  const index = (staple.prefer ?? []).findIndex((re) => re.test(text));
  return index === -1 ? Infinity : index;
}

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

const DANISH = /(^|[^a-zæøå])(danmark|dansk|danske)(?![a-zæøå])/i;

/**
 * Er økologi ikke muligt, vælges en dansk vare. Ordrehistorikken nævner kun
 * sjældent oprindelsesland, så det gælder fuldt ud først, når produktsiden
 * slås op ved "Læg i kurv".
 */
export function isDanish(product: { name: string; description: string }): boolean {
  return DANISH.test(product.name) || DANISH.test(product.description);
}

/** Husholdnings- og plejevarer får deres egen liste i stedet for standardlisten. */
export function isHousehold(product: { mainGroup: string }): boolean {
  return product.mainGroup === "Husholdning" || product.mainGroup === "Pleje";
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
