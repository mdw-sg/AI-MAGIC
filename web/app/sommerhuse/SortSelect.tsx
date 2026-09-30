"use client";

import { SORT_OPTIONS, type SortKey } from "@/lib/sommerhuse/sort";

export default function SortSelect({ defaultValue }: { defaultValue: SortKey }) {
  return (
    <select
      name="sort"
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-9 rounded-md border border-black/[.08] bg-white px-2 text-sm dark:border-white/[.145] dark:bg-[#111]"
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
