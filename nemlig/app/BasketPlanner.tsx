"use client";

import { useMemo, useState } from "react";
import type { Analysis, ProductStats } from "@/lib/analysis";
import type { BasketItemResult } from "@/lib/basket";
import ProductRow from "./ProductRow";

type Selection = Record<string, { selected: boolean; quantity: number }>;

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });

const STATUS_LABEL: Record<BasketItemResult["status"], string> = {
  added: "Lagt i kurven",
  already: "Var allerede i kurven",
  unavailable: "Ikke tilføjet",
  notFound: "Ikke fundet hos nemlig",
  error: "Fejl",
};

function initialSelection(analysis: Analysis): Selection {
  const selection: Selection = {};
  const lists: [ProductStats[], boolean][] = [
    [analysis.standard, true],
    [analysis.dueSoon, false],
    [analysis.household, false],
    [analysis.onlyOnOffer, false],
    [analysis.other, false],
  ];
  for (const [products, selected] of lists) {
    for (const p of products) selection[p.productId] = { selected, quantity: p.typicalQuantity };
  }
  return selection;
}

export default function BasketPlanner({ analysis }: { analysis: Analysis }) {
  const [selection, setSelection] = useState<Selection>(() => initialSelection(analysis));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BasketItemResult[] | null>(null);

  const all = useMemo(
    () => [
      ...analysis.standard,
      ...analysis.dueSoon,
      ...analysis.household,
      ...analysis.onlyOnOffer,
      ...analysis.other,
    ],
    [analysis]
  );
  const chosen = all.filter((p) => selection[p.productId]?.selected);

  function toggle(id: string) {
    setSelection((s) => ({ ...s, [id]: { ...s[id], selected: !s[id].selected } }));
  }
  function setQuantity(id: string, quantity: number) {
    const q = Math.min(30, Math.max(1, Math.round(quantity) || 1));
    setSelection((s) => ({ ...s, [id]: { ...s[id], quantity: q } }));
  }

  async function addToBasket() {
    setIsLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosen.map((p) => ({
            productId: p.productId,
            name: p.name,
            mainGroup: p.mainGroup,
            quantity: selection[p.productId].quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Noget gik galt");
      else setResults(data.results);
    } catch {
      setError("Noget gik galt — tjek terminalens log");
    } finally {
      setIsLoading(false);
    }
  }

  function list(products: ProductStats[]) {
    return (
      <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
        {products.map((p) => (
          <ProductRow
            key={p.productId}
            product={p}
            windowSize={analysis.windowSize}
            selected={selection[p.productId].selected}
            quantity={selection[p.productId].quantity}
            onToggle={() => toggle(p.productId)}
            onQuantity={(q) => setQuantity(p.productId, q)}
          />
        ))}
      </ul>
    );
  }

  function section(title: string, subtitle: string, products: ProductStats[]) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            {title} ({products.length})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>
        {products.length === 0 ? <p className="text-sm text-zinc-500">Ingen varer.</p> : list(products)}
      </section>
    );
  }

  function collapsed(title: string, products: ProductStats[]) {
    return (
      <details className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]">
        <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
          {title} ({products.length})
        </summary>
        <div className="mt-2">{list(products)}</div>
      </details>
    );
  }

  return (
    <>
      {section(
        "Standardvarer",
        "Dine faste varer plus alt, der er med i mindst halvdelen af dine seneste ordrer. Valgt på forhånd.",
        analysis.standard
      )}
      {section(
        "Kan snart være tid igen",
        "Varer du har købt mindst 3 gange med fast mellemrum og inden for det seneste halve år, hvor der nu er gået omtrent så længe.",
        analysis.dueSoon
      )}
      {section(
        "Husholdningsvarer",
        "Rengøring, papir, pleje m.m., som du enten køber fast eller snart skal have igen.",
        analysis.household
      )}
      {collapsed("Slik og kiosk — kun når det er på tilbud", analysis.onlyOnOffer)}
      {collapsed("Øvrige varer du har købt", analysis.other)}

      {results && (
        <section className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Resultat</h2>
          <ul className="divide-y divide-black/[.06] text-sm dark:divide-white/[.08]">
            {results.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-black dark:text-zinc-50">
                    {r.chosen?.name ?? r.requestedName}
                    {r.chosen && r.chosen.name !== r.requestedName && (
                      <span className="font-normal text-zinc-500"> (i stedet for {r.requestedName})</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {[
                      r.chosen?.description,
                      r.chosen && currency.format(r.chosen.price),
                      r.chosen?.offer && `🏷 ${r.chosen.offer}`,
                      r.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-right text-xs font-medium ${
                    r.status === "added" || r.status === "already"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {STATUS_LABEL[r.status]}
                  {r.quantity > 0 && ` · ${r.quantity} stk`}
                </p>
              </li>
            ))}
          </ul>
          <a
            href="https://www.nemlig.com/basket"
            target="_blank"
            rel="noreferrer"
            className="self-start text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Gå til kurven på nemlig.com →
          </a>
        </section>
      )}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-full border border-black/[.08] bg-white/90 px-4 py-2 backdrop-blur dark:border-white/[.145] dark:bg-black/80">
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        {isLoading && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Slår {chosen.length} varer op og lægger dem i kurven — det tager lidt tid…
          </p>
        )}
        <button
          onClick={addToBasket}
          disabled={isLoading || chosen.length === 0}
          className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {isLoading ? "Lægger i kurv…" : `Læg ${chosen.length} varer i kurven`}
        </button>
      </div>
    </>
  );
}
