"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ActionButton({
  endpoint,
  label,
  loadingLabel,
  hint,
  variant = "primary",
}: {
  endpoint: string;
  label: string;
  loadingLabel: string;
  hint?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Noget gik galt");
      router.refresh();
    } catch {
      setError("Noget gik galt — tjek terminalens log");
    } finally {
      setIsLoading(false);
    }
  }

  const style =
    variant === "primary"
      ? "bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
      : "border border-black/[.12] text-black hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-white/[.06]";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-60 ${style}`}
      >
        {isLoading ? loadingLabel : label}
      </button>
      {isLoading && hint && (
        <p className="max-w-xs text-right text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>
      )}
      {error && <p className="max-w-xs text-right text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
