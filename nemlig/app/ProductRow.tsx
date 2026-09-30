import type { ProductStats } from "@/lib/analysis";
import { isHousehold } from "@/lib/preferences";

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });

export default function ProductRow({
  product,
  windowSize,
  selected,
  quantity,
  onToggle,
  onQuantity,
  reason,
  onDismiss,
}: {
  product: ProductStats;
  windowSize: number;
  selected: boolean;
  quantity: number;
  onToggle: () => void;
  onQuantity: (quantity: number) => void;
  /** AI'ens begrundelse for forslaget. */
  reason?: string;
  onDismiss?: () => void;
}) {
  const interval = product.avgIntervalDays;
  // Øko/dansk er kun relevant for fødevarer, ikke fx opvasketabs.
  const showOrigin = !product.isOrganic && !isHousehold(product);
  return (
    <li className={`flex items-center gap-3 py-2 ${selected ? "" : "opacity-60"}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Læg ${product.name} i kurven`}
        className="h-4 w-4 shrink-0 accent-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{product.name}</p>
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
          {product.description} · {currency.format(product.lastUnitPrice)}
        </p>
        {(product.pinnedLabel || showOrigin || product.offer) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {product.offer && (
              <span
                className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                title={`${product.offer.name} · ${product.offer.description}`}
              >
                Tilbud: {product.offer.campaignText ?? currency.format(product.offer.price)}
                {product.offer.savings ? ` · spar ${currency.format(product.offer.savings)}` : ""}
                {product.offer.name !== product.name && ` (${product.offer.name})`}
              </span>
            )}
            {product.pinnedLabel && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                Fast standardvare
              </span>
            )}
            {showOrigin && product.isDanish && (
              <span
                className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                title="Ikke økologisk, men dansk"
              >
                Dansk
              </span>
            )}
            {showOrigin && !product.isDanish && (
              <span
                className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                title="Du har ikke købt en økologisk eller dansk udgave af denne vare før"
              >
                Ikke øko
              </span>
            )}
          </div>
        )}
        {reason && <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">💡 {reason}</p>}
      </div>
      {product.totalCount > 0 && (
        <div className="hidden shrink-0 text-right text-xs text-zinc-600 sm:block dark:text-zinc-400">
          <p>
            {product.countInWindow}/{windowSize} ordrer
            {interval !== null && ` · ca. hver ${Math.round(interval)}. dag`}
          </p>
          <p>Sidst købt for {product.daysSinceLast} dage siden</p>
        </div>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-xs text-zinc-500 hover:text-rose-600 hover:underline dark:hover:text-rose-400"
          title="Skjul forslaget og husk det til næste gang"
        >
          Ikke interesseret
        </button>
      )}
      <input
        type="number"
        min={1}
        max={30}
        value={quantity}
        onChange={(e) => onQuantity(Number(e.target.value))}
        aria-label={`Antal ${product.name}`}
        className="h-8 w-14 shrink-0 rounded-md border border-black/[.12] bg-white px-2 text-right text-sm dark:border-white/[.2] dark:bg-[#111]"
      />
    </li>
  );
}
