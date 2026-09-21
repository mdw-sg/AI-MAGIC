"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FavoriteToggle({
  id,
  initialFavorited,
}: {
  id: string;
  initialFavorited: boolean;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    setFavorited((f) => !f);
    try {
      const res = await fetch("/api/sommerhuse/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setFavorited((f) => !f);
      } else {
        router.refresh();
      }
    } catch {
      setFavorited((f) => !f);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      aria-label={favorited ? "Fjern favorit" : "Markér som favorit"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[.08] text-lg transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
    >
      {favorited ? "★" : "☆"}
    </button>
  );
}
