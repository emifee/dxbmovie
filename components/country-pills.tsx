"use client";

import { useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

/**
 * Horizontally scrolling country filter row with search.
 */
export function CountryPills({
  selected,
  onSelect,
}: {
  selected: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = COUNTRIES.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary h-4 w-4" />
        <input 
          type="text" 
          placeholder="Search countries..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-surface border border-border rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary/50 transition"
        />
      </div>
      <div className={cn("no-scrollbar flex overflow-x-auto", query ? "flex-wrap gap-2 justify-start mx-1" : "-mx-5 gap-2 px-5")}>
        {filtered.map((c) => {
          const active = c.id === selected;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition duration-200",
                active
                  ? "bg-gradient-primary text-white shadow-glow border-transparent"
                  : "border border-border bg-surface text-text-secondary hover:text-white hover:border-white/20"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
