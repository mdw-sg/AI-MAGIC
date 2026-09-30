import type { Order } from "./types";

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

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProductStats = {
  productId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  productUrl: string | null;
  mainGroup: string;
  lastUnitPrice: number;
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
  other: ProductStats[];
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

export function analyzeOrders(orders: Order[], now = Date.now()): Analysis {
  const withLines = orders
    .filter((o) => o.lines.length > 0)
    .sort((a, b) => purchaseTime(b) - purchaseTime(a));
  const windowIds = new Set(withLines.slice(0, WINDOW_ORDERS).map((o) => o.id));
  const windowSize = windowIds.size;

  const byProduct = new Map<
    string,
    { stats: ProductStats; quantities: number[]; times: number[] }
  >();

  // Nyeste ordre først, så navn, billede og pris kommer fra seneste køb.
  for (const order of withLines) {
    const time = purchaseTime(order);
    const inWindow = windowIds.has(order.id);
    // En vare kan stå på flere linjer i samme ordre; læg dem sammen.
    const perOrder = new Map<string, number>();
    for (const line of order.lines) {
      perOrder.set(line.productId, (perOrder.get(line.productId) ?? 0) + line.quantity);
    }
    for (const line of order.lines) {
      if (!perOrder.has(line.productId)) continue;
      const quantity = perOrder.get(line.productId)!;
      perOrder.delete(line.productId);

      let entry = byProduct.get(line.productId);
      if (!entry) {
        entry = {
          stats: {
            productId: line.productId,
            name: line.name,
            description: line.description,
            imageUrl: line.imageUrl,
            productUrl: line.productUrl,
            mainGroup: line.mainGroup,
            lastUnitPrice: line.unitPrice,
            countInWindow: 0,
            shareInWindow: 0,
            totalCount: 0,
            typicalQuantity: 0,
            lastPurchased: new Date(time).toISOString(),
            daysSinceLast: Math.max(0, Math.round((now - time) / DAY_MS)),
            avgIntervalDays: null,
          },
          quantities: [],
          times: [],
        };
        byProduct.set(line.productId, entry);
      }
      entry.stats.totalCount += 1;
      entry.times.push(time);
      if (inWindow) {
        entry.stats.countInWindow += 1;
        entry.quantities.push(quantity);
      }
    }
  }

  const standard: ProductStats[] = [];
  const dueSoon: ProductStats[] = [];
  const other: ProductStats[] = [];
  const minCount = Math.min(STANDARD_MIN_COUNT, Math.max(2, Math.ceil(windowSize / 2)));

  for (const { stats, quantities, times } of byProduct.values()) {
    stats.shareInWindow = windowSize ? stats.countInWindow / windowSize : 0;
    stats.typicalQuantity = Math.max(1, Math.round(median(quantities.length ? quantities : [1])));
    stats.avgIntervalDays = meanInterval(times);

    if (stats.shareInWindow >= STANDARD_SHARE && stats.countInWindow >= minCount) {
      standard.push(stats);
    } else if (
      stats.avgIntervalDays !== null &&
      stats.daysSinceLast >= stats.avgIntervalDays * DUE_FROM &&
      stats.daysSinceLast <= stats.avgIntervalDays * DUE_UNTIL
    ) {
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
  other.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name, "da"));

  return {
    orderCount: withLines.length,
    windowSize,
    avgOrderIntervalDays: meanInterval(withLines.map(purchaseTime)),
    standard,
    dueSoon,
    other,
  };
}
