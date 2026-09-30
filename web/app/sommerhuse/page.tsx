import { getAllListings, getLatestRefreshRuns } from "@/lib/sommerhuse/db";
import { matchListing } from "@/lib/sommerhuse/criteria";
import RefreshButton from "./RefreshButton";
import ListingCard from "./ListingCard";

// DB-indholdet ændrer sig uden for Next.js' egen fetch-cache (via
// "Opdater nu"-knappen), så siden skal læses fra databasen ved hvert kald
// frem for at blive statisk genereret ved build.
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  home: "home.dk",
  nybolig: "nybolig.dk",
  danbolig: "danbolig.dk",
};

const DEFAULT_MAX_PRICE = 4_000_000;

export default async function SommerhusePage(props: PageProps<"/sommerhuse">) {
  const searchParams = await props.searchParams;
  const maxPriceParam = Array.isArray(searchParams.maxPrice)
    ? searchParams.maxPrice[0]
    : searchParams.maxPrice;
  // Intet "maxPrice"-parameter overhovedet = første besøg -> standardfilter.
  // Et tomt "maxPrice=" (fra "Fjern prisfilter") betyder derimod bevidst
  // ingen grænse, og skal ikke falde tilbage til standardværdien.
  let maxPrice: number | null;
  if (!("maxPrice" in searchParams)) {
    maxPrice = DEFAULT_MAX_PRICE;
  } else if (!maxPriceParam) {
    maxPrice = null;
  } else {
    const parsed = Number(maxPriceParam);
    maxPrice = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const listings = getAllListings();
  const runs = getLatestRefreshRuns();

  const withMatch = listings
    .map((listing) => ({ listing, match: matchListing(listing) }))
    .sort((a, b) => b.match.score - a.match.score);

  // Prisfilteret gælder kun "Alle forslag" — en favoritmarkeret bolig skal
  // blive ved med at være synlig, selvom prisen senere stiger over filteret.
  const favorites = withMatch.filter((x) => x.listing.favoritedAt);
  const others = withMatch.filter(
    (x) =>
      !x.listing.favoritedAt &&
      (maxPrice == null || x.listing.price == null || x.listing.price <= maxPrice)
  );

  const hasRunBefore = runs.length > 0;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Sommerhuse
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {others.length + favorites.length} af {listings.length} sommerhuse vist ·{" "}
              {runs.length > 0
                ? runs
                    .map(
                      (r) =>
                        `${SOURCE_LABEL[r.source] ?? r.source}: ${
                          r.status === "ok" ? "ok" : "fejl"
                        }${r.finishedAt ? ` (${new Date(r.finishedAt).toLocaleString("da-DK")})` : ""}`
                    )
                    .join(" · ")
                : "Ingen opdatering kørt endnu"}
            </p>
            {!hasRunBefore && (
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                Første opdatering kan tage nogle minutter, da alle sommerhuse hentes for
                første gang.
              </p>
            )}
          </div>
          <RefreshButton />
        </div>

        <form className="flex flex-wrap items-end gap-3" action="/sommerhuse">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Maks. pris (kr.)
            <input
              type="number"
              name="maxPrice"
              step={100_000}
              min={0}
              defaultValue={maxPrice ?? ""}
              placeholder="Ingen grænse"
              className="h-9 w-40 rounded-md border border-black/[.08] bg-white px-2 text-sm dark:border-white/[.145] dark:bg-[#111]"
            />
          </label>
          <button
            type="submit"
            className="flex h-9 items-center justify-center rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Filtrér
          </button>
          {maxPrice != null && (
            <a
              href="/sommerhuse?maxPrice="
              className="text-sm text-zinc-500 hover:underline dark:text-zinc-500"
            >
              Fjern prisfilter
            </a>
          )}
        </form>

        {favorites.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Favoritter ({favorites.length})
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map(({ listing, match }, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  match={match}
                  eager={index < 3}
                />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Alle forslag ({others.length})
          </h2>
          {others.length === 0 && listings.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Ingen boliger endnu — klik &quot;Opdater nu&quot; for at hente den første
              omgang data.
            </p>
          ) : others.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Ingen boliger matcher det nuværende prisfilter.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map(({ listing, match }, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  match={match}
                  eager={favorites.length === 0 && index < 3}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
