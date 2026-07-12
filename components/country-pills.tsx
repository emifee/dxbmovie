"use client";

import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Horizontally scrolling country filter row.
 */
export function CountryPills({
  selected,
  onSelect,
}: {
  selected: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-0">
      {COUNTRIES.map((c) => {
        const active = c.id === selected;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition duration-200",
              active
                ? "bg-gradient-primary text-white shadow-glow"
                : "border border-border bg-surface text-text-secondary hover:text-white"
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
