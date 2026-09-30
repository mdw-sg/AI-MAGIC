import { analyzeOrders } from "@/lib/analysis";
import { getOrderCache } from "@/lib/orders";
import { getSession } from "@/lib/session";
import ActionButton from "./ActionButton";
import BasketPlanner from "./BasketPlanner";

// Login-status og ordrehistorik ligger i lokale filer, der ændres via
// knapperne, så siden skal læses ved hvert kald.
export const dynamic = "force-dynamic";

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
                  endpoint="/api/sync"
                  label="Hent ordrehistorik"
                  loadingLabel="Henter…"
                  hint="Første gang hentes op til 40 ordrer — det tager lidt tid."
                />
                <ActionButton
                  endpoint="/api/logout"
                  label="Log ud"
                  loadingLabel="Logger ud…"
                  variant="secondary"
                />
              </>
            ) : (
              <ActionButton
                endpoint="/api/login"
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
              . Antal er dit typiske antal pr. ordre — ret det og sæt flueben, før du lægger i kurven. Værktøjet vælger øko på lager, ellers dansk, og fjerner aldrig noget fra kurven.
            </p>
            {analysis.missingPinned.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Faste standardvarer, der ikke findes i din ordrehistorik:{" "}
                {analysis.missingPinned.join(", ")}.
              </p>
            )}
            <BasketPlanner analysis={analysis} />
          </>
        )}
      </main>
    </div>
  );
}
