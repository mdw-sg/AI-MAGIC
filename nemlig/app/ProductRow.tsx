import Image from "next/image";
import type { ProductStats } from "@/lib/analysis";

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });

export default function ProductRow({
  product,
  windowSize,
}: {
  product: ProductStats;
  windowSize: number;
}) {
  const interval = product.avgIntervalDays;
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-white">
        {product.imageUrl && (
          <Image src={product.imageUrl} alt="" fill sizes="48px" className="object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
          {product.productUrl ? (
            <a
              href={`https://www.nemlig.com/${product.productUrl}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {product.name}
            </a>
          ) : (
            product.name
          )}
        </p>
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
          {product.description} · {currency.format(product.lastUnitPrice)}
        </p>
        {(product.pinnedLabel || !product.isOrganic) && (
          <div className="mt-1 flex gap-1">
            {product.pinnedLabel && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                Fast standardvare
              </span>
            )}
            {!product.isOrganic && (
              <span
                className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                title="Du har ikke købt en økologisk udgave af denne vare før"
              >
                Ikke øko
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-zinc-600 dark:text-zinc-400">
        <p>
          {product.countInWindow}/{windowSize} ordrer
          {interval !== null && ` · ca. hver ${Math.round(interval)}. dag`}
        </p>
        <p>Sidst købt for {product.daysSinceLast} dage siden</p>
      </div>
      <div className="w-14 shrink-0 text-right text-sm font-semibold text-black dark:text-zinc-50">
        {product.typicalQuantity} stk
      </div>
    </li>
  );
}
