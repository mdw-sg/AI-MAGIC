import { analyzeOrders, type ProductStats } from "@/lib/nemlig/analysis";
import { getOrderCache } from "@/lib/nemlig/orders";
import { getSession } from "@/lib/nemlig/session";
import ActionButton from "./ActionButton";
import ProductRow from "./ProductRow";

// Login-status og ordrehistorik ligger i lokale filer, der ændres via
// knapperne, så siden skal læses ved hvert kald.
export const dynamic = "force-dynamic";

function Section({
  title,
  subtitle,
  products,
  windowSize,
}: {
  title: string;
  subtitle: string;
  products: ProductStats[];
  windowSize: number;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          {title} ({products.length})
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-zinc-500">Ingen varer.</p>
      ) : (
        <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
          {products.map((p) => (
            <ProductRow key={p.productId} product={p} windowSize={windowSize} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function NemligPage() {
  const session = getSession();
  const cache = getOrderCache();
  const analysis = cache ? analyzeOrders(cache.orders) : null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Nemlig-indkøb
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {session
                ? `Logget ind siden ${new Date(session.savedAt).toLocaleString("da-DK")}`
                : "Ikke logget ind"}
              {cache &&
                ` · ${cache.orders.length} ordrer hentet ${new Date(cache.syncedAt).toLocaleString("da-DK")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {session ? (
              <>
                <ActionButton
                  endpoint="/api/nemlig/sync"
                  label="Hent ordrehistorik"
                  loadingLabel="Henter…"
                  hint="Første gang hentes op til 40 ordrer — det tager lidt tid."
                />
                <ActionButton
                  endpoint="/api/nemlig/logout"
                  label="Log ud"
                  loadingLabel="Logger ud…"
                  variant="secondary"
                />
              </>
            ) : (
              <ActionButton
                endpoint="/api/nemlig/login"
                label="Log ind på nemlig.com"
                loadingLabel="Venter på login…"
                hint="Et Chrome-vindue åbner. Log ind som normalt — vinduet lukker selv bagefter."
              />
            )}
          </div>
        </div>

        {!analysis ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {session
              ? 'Klik "Hent ordrehistorik" for at analysere dine tidligere ordrer.'
              : "Log ind for at komme i gang. Værktøjet ser aldrig din adgangskode — du indtaster den direkte på nemlig.com."}
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Analyseret ud fra dine seneste {analysis.windowSize} af {analysis.orderCount} ordrer
              {analysis.avgOrderIntervalDays !== null &&
                ` · du bestiller ca. hver ${Math.round(analysis.avgOrderIntervalDays)}. dag`}
              . Antal er dit typiske antal pr. ordre.
            </p>
            <Section
              title="Standardvarer"
              subtitle="Med i mindst halvdelen af dine seneste ordrer."
              products={analysis.standard}
              windowSize={analysis.windowSize}
            />
            <Section
              title="Kan snart være tid igen"
              subtitle="Varer du køber med fast mellemrum, hvor der nu er gået omtrent så længe."
              products={analysis.dueSoon}
              windowSize={analysis.windowSize}
            />
            <details className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#111]">
              <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
                Øvrige varer du har købt ({analysis.other.length})
              </summary>
              <ul className="mt-2 divide-y divide-black/[.06] dark:divide-white/[.08]">
                {analysis.other.map((p) => (
                  <ProductRow key={p.productId} product={p} windowSize={analysis.windowSize} />
                ))}
              </ul>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
