import type { ProductStats } from "./analysis";

// Delt mellem browseren og serveren, så den indeholder ingen server-kode.

export type BasketRequestItem = {
  /** Varenummer fra ordrehistorikken — kan være udgået hos nemlig. */
  productId: string;
  name: string;
  mainGroup: string;
  quantity: number;
  /** Tilbudsvaren, der foretrækkes, hvis den er på lager. */
  preferredProductId?: string | null;
  /** Fast standardvare — dens prioritering slås op her på serveren. */
  pinnedLabel?: string | null;
};

export function basketItemFor(p: ProductStats, quantity = p.typicalQuantity): BasketRequestItem {
  return {
    productId: p.productId,
    name: p.name,
    mainGroup: p.mainGroup,
    quantity,
    preferredProductId: p.offer?.productId ?? null,
    pinnedLabel: p.pinnedLabel,
  };
}
