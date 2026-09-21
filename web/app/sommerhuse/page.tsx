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

export default function SommerhusePage() {
  const listings = getAllListings();
  const runs = getLatestRefreshRuns();

  const withMatch = listings
    .map((listing) => ({ listing, match: matchListing(listing) }))
    .sort((a, b) => b.match.score - a.match.score);

  const favorites = withMatch.filter((x) => x.listing.favoritedAt);
  const others = withMatch.filter((x) => !x.listing.favoritedAt);

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
              {listings.length} sommerhuse fundet ·{" "}
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

        {favorites.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Favoritter ({favorites.length})
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map(({ listing, match }) => (
                <ListingCard key={listing.id} listing={listing} match={match} />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Alle forslag ({others.length})
          </h2>
          {others.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Ingen boliger endnu — klik &quot;Opdater nu&quot; for at hente den første
              omgang data.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map(({ listing, match }) => (
                <ListingCard key={listing.id} listing={listing} match={match} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
