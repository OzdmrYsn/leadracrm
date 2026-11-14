"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "./cn";

export type SortDirection = "asc" | "desc";
export type SortState<K extends string> = { key: K; direction: SortDirection };

/** Tablo sıralama durumu. Aynı sütun yeniden seçilince yön değişir; yeni sütun artan başlar. */
export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState(initial);
  return {
    sort,
    toggle: (key: K) =>
      setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" })),
    directionOf: (key: K): SortDirection | null => (sort.key === key ? sort.direction : null),
  };
}

/** Sütun başlığı. onSort verilirse sıralama düğmesi olur; yön ekran okuyucuya aria-sort ile söylenir. */
export function SortTh({
  label,
  direction,
  onSort,
  title,
  align,
}: {
  label: string;
  /** Tablo bu sütuna göre sıralıysa yönü. */
  direction?: SortDirection | null;
  onSort?: () => void;
  title?: string;
  align?: "right";
}) {
  return (
    <th
      scope="col"
      aria-sort={direction ? (direction === "asc" ? "ascending" : "descending") : undefined}
      className={cn("px-3 py-1 font-medium", align === "right" && "text-right")}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          title={title}
          className={cn("inline-flex h-6 items-center gap-1 rounded-sm transition-colors hover:text-fg", direction && "text-fg")}
        >
          {label}
          {direction === "asc" ? (
            <ArrowUp aria-hidden className="size-3" />
          ) : direction === "desc" ? (
            <ArrowDown aria-hidden className="size-3" />
          ) : (
            <ArrowUpDown aria-hidden className="size-3" />
          )}
        </button>
      ) : (
        <span className="inline-flex h-6 items-center">{label}</span>
      )}
    </th>
  );
}
