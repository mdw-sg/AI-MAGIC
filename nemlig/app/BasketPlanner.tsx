"use client";

import { useMemo, useState } from "react";
import type { Analysis, ProductStats } from "@/lib/analysis";
import type { BasketItemResult } from "@/lib/basket";
import ProductRow from "./ProductRow";

type Selection = Record<string, { selected: boolean; quantity: number }>;

type Tab = {
  id: string;
  label: string;
  description: string;
  groups: { heading?: string; products: ProductStats[] }[];
};

const currency = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });

const STATUS_LABEL: Record<BasketItemResult["status"], string> = {
  added: "Lagt i kurven",
  already: "Var allerede i kurven",
  unavailable: "Ikke tilføjet",
  notFound: "Ikke fundet hos nemlig",
  error: "Fejl",
};

function buildTabs(analysis: Analysis): Tab[] {
  return [
    {
      id: "standard",
      label: "Standardvarer",
      description:
        "Dine faste varer plus alt, der er med i mindst halvdelen af dine seneste ordrer. Valgt på forhånd.",
      groups: [{ products: analysis.standard }],
    },
    {
      id: "due",
      label: "Snart tid igen",
      description:
        "Varer du har købt mindst 3 gange med fast mellemrum og inden for det seneste halve år, hvor der nu er gået omtrent så længe.",
      groups: [{ products: analysis.dueSoon }],
    },
    {
      id: "offers",
      label: "På tilbud",
      description: analysis.offersFetchedAt
        ? `Varer du har købt mindst 2 gange, som er på tilbud nu (tilbud hentet ${new Date(
            analysis.offersFetchedAt
          ).toLocaleString("da-DK")}). Køber du varen økologisk, vises kun tilbud på øko-udgaven.`
        : 'Klik "Opdater ordrer og tilbud" for at hente ugens tilbud.',
      groups: [{ products: analysis.onOffer }],
    },
    {
      id: "household",
      label: "Husholdning",
      description: "Rengøring, papir, pleje m.m., som du enten køber fast eller snart skal have igen.",
      groups: [{ products: analysis.household }],
    },
    {
      id: "other",
      label: "Øvrige",
      description: "Alt andet, du har købt. Slik foreslås kun, når det er på tilbud — se fanen \"På tilbud\".",
      groups: [
        { heading: "Øvrige varer", products: analysis.other },
        { heading: "Slik og kiosk", products: analysis.onlyOnOffer },
      ],
    },
  ];
}

function initialSelection(tabs: Tab[], standard: ProductStats[]): Selection {
  const preselected = new Set(standard.map((p) => p.productId));
  const selection: Selection = {};
  for (const tab of tabs) {
    for (const group of tab.groups) {
      for (const p of group.products) {
        selection[p.productId] ??= {
          selected: preselected.has(p.productId),
          quantity: p.typicalQuantity,
        };
      }
    }
  }
  return selection;
}

export default function BasketPlanner({ analysis }: { analysis: Analysis }) {
  const tabs = useMemo(() => buildTabs(analysis), [analysis]);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [selection, setSelection] = useState<Selection>(() =>
    initialSelection(tabs, analysis.standard)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BasketItemResult[] | null>(null);

  // En vare kan stå i flere faner (fx en standardvare på tilbud); den deler
  // flueben og antal på tværs og tælles kun én gang.
  const uniqueProducts = useMemo(() => {
    const byId = new Map<string, ProductStats>();
    for (const tab of tabs)
      for (const group of tab.groups) for (const p of group.products) byId.set(p.productId, p);
    return [...byId.values()];
  }, [tabs]);
  const chosen = uniqueProducts.filter((p) => selection[p.productId]?.selected);

  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

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
            preferredProductId: p.offer?.productId ?? null,
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

  return (
    <>
      <div
        role="tablist"
        aria-label="Varelister"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-black/[.08] px-1 dark:border-white/[.145]"
      >
        {tabs.map((t) => {
          const products = new Map(
            t.groups.flatMap((g) => g.products).map((p) => [p.productId, p])
          );
          const selectedCount = [...products.keys()].filter((id) => selection[id]?.selected).length;
          const isActive = t.id === tab.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-foreground text-black dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-black dark:hover:text-zinc-50"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  selectedCount > 0
                    ? "bg-foreground text-background"
                    : "bg-black/[.06] text-zinc-600 dark:bg-white/[.1] dark:text-zinc-400"
                }`}
                title={`${selectedCount} af ${products.size} valgt`}
              >
                {selectedCount > 0 ? `${selectedCount}/${products.size}` : products.size}
              </span>
            </button>
          );
        })}
      </div>

      <section
        role="tabpanel"
        className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tab.description}</p>
        {tab.groups.map((group, i) => (
          <div key={i} className="flex flex-col gap-1">
            {group.heading && (
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                {group.heading} ({group.products.length})
              </h3>
            )}
            {group.products.length === 0 ? (
              <p className="text-sm text-zinc-500">Ingen varer.</p>
            ) : (
              <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                {group.products.map((p) => (
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
            )}
          </div>
        ))}
      </section>

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
                      r.chosen?.offer && `Tilbud: ${r.chosen.offer}`,
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

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-full border border-black/[.08] bg-white/90 px-4 py-2 shadow-sm backdrop-blur dark:border-white/[.145] dark:bg-black/80">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {isLoading
            ? `Slår ${chosen.length} varer op og lægger dem i kurven — det tager lidt tid…`
            : `${chosen.length} varer valgt på tværs af fanerne`}
        </p>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
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
