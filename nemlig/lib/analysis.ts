import {
  isDanish,
  isHousehold,
  isOnlyWhenOnOffer,
  isOrganic,
  PINNED_STAPLES,
  productKey,
} from "./preferences";
import type { Offer } from "./offers";
import type { Order, OrderLine } from "./types";

// Standardvarer vurderes ud fra de seneste ordrer, så gamle vaner, man er
// holdt op med, ikke bliver ved med at dukke op.
const WINDOW_ORDERS = 15;
// Andel af ordrerne i vinduet, en vare skal være med i for at være standard.
const STANDARD_SHARE = 0.5;
const STANDARD_MIN_COUNT = 3;
// En ikke-standardvare foreslås, når der er gået mindst 85 % af den typiske
// tid mellem køb — men ikke hvis det er over 3 gange så længe siden (så er
// det sandsynligvis en vane, der er stoppet).
const DUE_FROM = 0.85;
const DUE_UNTIL = 3;
// ...og kun for varer, man har købt flere gange og inden for det seneste
// halve år, så enkeltkøb og gamle vaner ikke fylder listen.
const DUE_MIN_PURCHASES = 3;
const DUE_MAX_DAYS_SINCE = 183;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProductStats = {
  /** Varenummeret, der foreslås — øko-varianten, hvis den findes i historikken. */
  productId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  productUrl: string | null;
  mainGroup: string;
  lastUnitPrice: number;
  isOrganic: boolean;
  isDanish: boolean;
  /** Ugens tilbud på denne vare (eller en variant af den), hvis der er et. */
  offer: Offer | null;
  /** Sat, når varen er en fast standardvare valgt af brugeren. */
  pinnedLabel: string | null;
  /** Antal af de seneste ordrer (vinduet), varen var med i. */
  countInWindow: number;
  shareInWindow: number;
  /** Antal ordrer i hele historikken, varen var med i. */
  totalCount: number;
  typicalQuantity: number;
  lastPurchased: string;
  daysSinceLast: number;
  avgIntervalDays: number | null;
};

export type Analysis = {
  orderCount: number;
  windowSize: number;
  avgOrderIntervalDays: number | null;
  standard: ProductStats[];
  dueSoon: ProductStats[];
  /** Varer fra historikken, der er på tilbud nu — også slik. */
  onOffer: ProductStats[];
  offersFetchedAt: string | null;
  /** Husholdnings- og plejevarer, der er standard eller snart skal købes igen. */
  household: ProductStats[];
  /** Slik m.m., som kun foreslås, når det er på tilbud. */
  onlyOnOffer: ProductStats[];
  other: ProductStats[];
  /** Faste standardvarer, der ikke findes i ordrehistorikken. */
  missingPinned: string[];
};

type Variant = { line: OrderLine; count: number; lastTime: number };

type Group = {
  variants: Map<string, Variant>;
  times: number[];
  windowQuantities: number[];
  allQuantities: number[];
  countInWindow: number;
};

function purchaseTime(order: Order): number {
  return new Date(order.deliveryDate ?? order.orderDate).getTime();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanInterval(times: number[]): number | null {
  if (times.length < 2) return null;
  const sorted = [...times].sort((a, b) => a - b);
  return (sorted[sorted.length - 1] - sorted[0]) / (sorted.length - 1) / DAY_MS;
}

/** Øko først, så dansk, derefter den oftest købte, derefter den senest købte. */
function pickVariant(variants: Iterable<Variant>): Variant {
  return [...variants].sort(
    (a, b) =>
      Number(isOrganic(b.line.name)) - Number(isOrganic(a.line.name)) ||
      Number(isDanish(b.line)) - Number(isDanish(a.line)) ||
      b.count - a.count ||
      b.lastTime - a.lastTime
  )[0];
}

/**
 * Finder ugens bedste tilbud på en vare. Brugerens øko-regel gælder også her:
 * køber man varen økologisk, foreslås kun et tilbud på en øko-udgave.
 */
function findOffer(
  stats: ProductStats,
  variantIds: Iterable<string>,
  offersById: Map<string, Offer>,
  offersByKey: Map<string, Offer[]>
): Offer | null {
  const candidates = new Map<string, Offer>();
  for (const id of variantIds) {
    const offer = offersById.get(id);
    if (offer) candidates.set(offer.productId, offer);
  }
  for (const offer of offersByKey.get(productKey(stats.name)) ?? []) {
    candidates.set(offer.productId, offer);
  }
  return (
    [...candidates.values()]
      .filter((o) => !o.soldOut && (o.isOrganic || !stats.isOrganic || isHousehold(stats)))
      .sort(
        (a, b) => Number(b.isOrganic) - Number(a.isOrganic) || (b.savings ?? 0) - (a.savings ?? 0)
      )[0] ?? null
  );
}

export function analyzeOrders(
  orders: Order[],
  offerCache: { fetchedAt: string; offers: Offer[] } | null = null,
  now = Date.now()
): Analysis {
  const offers = offerCache?.offers ?? [];
  const offersById = new Map(offers.map((o) => [o.productId, o]));
  const offersByKey = new Map<string, Offer[]>();
  for (const offer of offers) {
    const key = productKey(offer.name);
    offersByKey.set(key, [...(offersByKey.get(key) ?? []), offer]);
  }

  const withLines = orders
    .filter((o) => o.lines.length > 0)
    .sort((a, b) => purchaseTime(b) - purchaseTime(a));
  const windowIds = new Set(withLines.slice(0, WINDOW_ORDERS).map((o) => o.id));
  const windowSize = windowIds.size;

  const groups = new Map<string, Group>();
  // Nemlig omdøber nogle gange en vare og beholder varenummeret. Et varenummer
  // hører derfor altid til den gruppe, det første gang blev set i (nyeste navn).
  const keyForId = new Map<string, string>();
  const keyFor = (line: OrderLine) => {
    let key = keyForId.get(line.productId);
    if (!key) {
      key = productKey(line.name);
      keyForId.set(line.productId, key);
    }
    return key;
  };
  for (const order of withLines) {
    const time = purchaseTime(order);
    const inWindow = windowIds.has(order.id);

    // Saml linjer pr. vare i ordren — både gentagne linjer og varianter
    // (fx øko og ikke-øko) af samme vare.
    const perOrder = new Map<string, { quantity: number; lines: OrderLine[] }>();
    for (const line of order.lines) {
      const key = keyFor(line);
      const entry = perOrder.get(key) ?? { quantity: 0, lines: [] };
      entry.quantity += line.quantity;
      entry.lines.push(line);
      perOrder.set(key, entry);
    }

    for (const [key, { quantity, lines }] of perOrder) {
      let group = groups.get(key);
      if (!group) {
        group = { variants: new Map(), times: [], windowQuantities: [], allQuantities: [], countInWindow: 0 };
        groups.set(key, group);
      }
      group.times.push(time);
      group.allQuantities.push(quantity);
      if (inWindow) {
        group.countInWindow += 1;
        group.windowQuantities.push(quantity);
      }
      for (const line of lines) {
        const variant = group.variants.get(line.productId);
        if (variant) {
          variant.count += 1;
        } else {
          // Ordrerne gennemgås nyeste først, så første forekomst er den seneste.
          group.variants.set(line.productId, { line, count: 1, lastTime: time });
        }
      }
    }
  }

  const all: ProductStats[] = [];
  for (const group of groups.values()) {
    const { line } = pickVariant(group.variants.values());
    const lastTime = Math.max(...group.times);
    const stats: ProductStats = {
      productId: line.productId,
      name: line.name,
      description: line.description,
      imageUrl: line.imageUrl,
      productUrl: line.productUrl,
      mainGroup: line.mainGroup,
      lastUnitPrice: line.unitPrice,
      isOrganic: isOrganic(line.name),
      isDanish: isDanish(line),
      offer: null,
      pinnedLabel: null,
      countInWindow: group.countInWindow,
      shareInWindow: windowSize ? group.countInWindow / windowSize : 0,
      totalCount: group.times.length,
      typicalQuantity: Math.max(
        1,
        Math.round(median(group.windowQuantities.length ? group.windowQuantities : group.allQuantities))
      ),
      lastPurchased: new Date(lastTime).toISOString(),
      daysSinceLast: Math.max(0, Math.round((now - lastTime) / DAY_MS)),
      avgIntervalDays: meanInterval(group.times),
    };
    stats.offer = findOffer(stats, group.variants.keys(), offersById, offersByKey);
    all.push(stats);
  }

  // Faste standardvarer: vælg den bedste match for hver (øko, oftest købt
  // for nylig, oftest købt i alt).
  const missingPinned: string[] = [];
  for (const staple of PINNED_STAPLES) {
    const best = all
      .filter((p) => staple.match.test(p.name) && !isOnlyWhenOnOffer(p))
      .sort(
        (a, b) =>
          Number(b.isOrganic) - Number(a.isOrganic) ||
          Number(b.isDanish) - Number(a.isDanish) ||
          b.countInWindow - a.countInWindow ||
          b.totalCount - a.totalCount
      )[0];
    if (best) best.pinnedLabel ??= staple.label;
    else missingPinned.push(staple.label);
  }

  const standard: ProductStats[] = [];
  const dueSoon: ProductStats[] = [];
  const household: ProductStats[] = [];
  const onlyOnOffer: ProductStats[] = [];
  const other: ProductStats[] = [];
  const minCount = Math.min(STANDARD_MIN_COUNT, Math.max(2, Math.ceil(windowSize / 2)));

  const isStandard = (p: ProductStats) =>
    Boolean(p.pinnedLabel) || (p.shareInWindow >= STANDARD_SHARE && p.countInWindow >= minCount);
  const isDue = (p: ProductStats) =>
    p.avgIntervalDays !== null &&
    p.totalCount >= DUE_MIN_PURCHASES &&
    p.daysSinceLast <= DUE_MAX_DAYS_SINCE &&
    p.daysSinceLast >= p.avgIntervalDays * DUE_FROM &&
    p.daysSinceLast <= p.avgIntervalDays * DUE_UNTIL;

  for (const stats of all) {
    if (isOnlyWhenOnOffer(stats)) {
      onlyOnOffer.push(stats);
    } else if (isHousehold(stats)) {
      (isStandard(stats) || isDue(stats) ? household : other).push(stats);
    } else if (isStandard(stats)) {
      standard.push(stats);
    } else if (isDue(stats)) {
      dueSoon.push(stats);
    } else {
      other.push(stats);
    }
  }

  standard.sort((a, b) => b.shareInWindow - a.shareInWindow || a.name.localeCompare(b.name, "da"));
  dueSoon.sort(
    (a, b) =>
      b.daysSinceLast / (b.avgIntervalDays ?? 1) - a.daysSinceLast / (a.avgIntervalDays ?? 1)
  );
  const onOffer = all
    .filter((p) => p.offer)
    .sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name, "da"));
  household.sort(
    (a, b) =>
      b.daysSinceLast / (b.avgIntervalDays ?? 1) - a.daysSinceLast / (a.avgIntervalDays ?? 1)
  );
  const byCount = (a: ProductStats, b: ProductStats) =>
    b.totalCount - a.totalCount || a.name.localeCompare(b.name, "da");
  onlyOnOffer.sort(byCount);
  other.sort(byCount);

  return {
    orderCount: withLines.length,
    windowSize,
    avgOrderIntervalDays: meanInterval(withLines.map(purchaseTime)),
    standard,
    dueSoon,
    onOffer,
    offersFetchedAt: offerCache?.fetchedAt ?? null,
    household,
    onlyOnOffer,
    other,
    missingPinned,
  };
}
