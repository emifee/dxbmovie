"use client";

import { GENRES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Horizontally scrolling genre filter row. Selected pill is gradient-filled;
 * the rest are dark with gray text.
 */
export function GenrePills({
  selected,
  onSelect,
}: {
  selected: number | "all";
  onSelect: (id: number | "all") => void;
}) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-0">
      {GENRES.map((g) => {
        const active = g.id === selected;
        return (
          <button
            key={String(g.id)}
            onClick={() => onSelect(g.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition duration-200",
              active
                ? "bg-gradient-primary text-white shadow-glow"
                : "border border-border bg-surface text-text-secondary hover:text-white",
            )}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
