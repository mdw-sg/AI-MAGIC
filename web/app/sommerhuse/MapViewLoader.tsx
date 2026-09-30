"use client";

import dynamic from "next/dynamic";
import type { Listing, MatchResult } from "@/lib/sommerhuse/types";

// leaflet toucher `window` allerede ved modul-evaluering, hvilket crasher
// under server-rendering. ssr:false kan kun bruges fra en Client Component,
// derfor denne tynde loader mellem den server-renderede page.tsx og MapView.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Indlæser kort…</p>
  ),
});

export default function MapViewLoader({
  items,
}: {
  items: { listing: Listing; match: MatchResult }[];
}) {
  return <MapView items={items} />;
}
