"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Listing, MatchResult } from "@/lib/sommerhuse/types";
import FavoriteToggle from "./FavoriteToggle";

const DENMARK_CENTER: LatLngExpression = [55.95, 11.5];

const currency = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  maximumFractionDigits: 0,
});

export default function MapView({
  items,
}: {
  items: { listing: Listing; match: MatchResult }[];
}) {
  const withCoords = items.filter(
    (x) => x.listing.latitude != null && x.listing.longitude != null
  );
  const withoutCoords = items.length - withCoords.length;

  const bounds: [number, number][] = withCoords.map((x) => [
    x.listing.latitude as number,
    x.listing.longitude as number,
  ]);

  return (
    <div className="flex flex-col gap-2">
      {withoutCoords > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {withoutCoords} bolig(er) uden kendte koordinater vises ikke på kortet.
        </p>
      )}
      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <MapContainer
          center={DENMARK_CENTER}
          zoom={7}
          bounds={bounds.length > 0 ? bounds : undefined}
          boundsOptions={{ padding: [20, 20] }}
          preferCanvas
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {withCoords.map(({ listing, match }) => (
            <CircleMarker
              key={listing.id}
              center={[listing.latitude as number, listing.longitude as number]}
              radius={listing.favoritedAt ? 8 : 5}
              pathOptions={{
                color: listing.favoritedAt ? "#ca8a04" : "#2563eb",
                fillColor: listing.favoritedAt ? "#facc15" : "#3b82f6",
                fillOpacity: 0.85,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="flex flex-col gap-1 text-sm">
                  <strong>{listing.address ?? "Ukendt adresse"}</strong>
                  <span>
                    {listing.postalCode} {listing.city}
                  </span>
                  <span>
                    {listing.price != null ? currency.format(listing.price) : "Pris ukendt"} ·
                    score {match.score}
                  </span>
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Se annonce →
                  </a>
                  <FavoriteToggle id={listing.id} initialFavorited={!!listing.favoritedAt} />
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
