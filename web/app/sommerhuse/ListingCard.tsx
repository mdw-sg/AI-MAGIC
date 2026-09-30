import Image from "next/image";
import type { Listing, MatchResult } from "@/lib/sommerhuse/types";
import { buildDingeoUrl, buildGoogleMapsUrl } from "@/lib/sommerhuse/dingeo";
import FavoriteToggle from "./FavoriteToggle";

const SOURCE_LABEL: Record<Listing["source"], string> = {
  home: "home",
  nybolig: "Nybolig",
  danbolig: "danbolig",
  edc: "EDC",
  estate: "Estate",
};

const currency = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  maximumFractionDigits: 0,
});

export default function ListingCard({
  listing,
  match,
  eager = false,
}: {
  listing: Listing;
  match: MatchResult;
  eager?: boolean;
}) {
  const dingeoUrl = buildDingeoUrl(listing);
  const mapsUrl = buildGoogleMapsUrl(listing);

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-lg border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#111]">
      <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-900">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.address ?? "Sommerhus"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading={eager ? "eager" : "lazy"}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
            Intet billede
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {SOURCE_LABEL[listing.source]} · score {match.score}
            </p>
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">
              {listing.address ?? "Ukendt adresse"}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {listing.postalCode} {listing.city}
            </p>
          </div>
          <FavoriteToggle id={listing.id} initialFavorited={!!listing.favoritedAt} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          {listing.price != null && <span>{currency.format(listing.price)}</span>}
          {listing.sizeM2 != null && <span>{listing.sizeM2} m² bolig</span>}
          {listing.lotSizeM2 != null && <span>{Math.round(listing.lotSizeM2)} m² grund</span>}
          {listing.rooms != null && <span>{listing.rooms} rum</span>}
          {listing.yearBuilt != null && <span>Bygget {listing.yearBuilt}</span>}
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">{match.reason}</p>

        <details className="text-sm text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer text-zinc-500 dark:text-zinc-500">
            Kræver manuel vurdering ({match.checkedManually.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {match.checkedManually.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Se annonce →
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Se på kort →
          </a>
          {dingeoUrl && (
            <a
              href={dingeoUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              DinGeo →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
