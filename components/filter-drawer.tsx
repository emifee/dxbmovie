"use client";

import { useEffect, useState } from "react";
import { X, ChevronDown, BookmarkPlus, Star } from "lucide-react";
import { useUIStore, useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// TMDB ID mappings
const NETWORKS = [
  { label: "Netflix", id: "213" },
  { label: "Amazon Prime Video", id: "1024" },
  { label: "Apple TV+", id: "2552" },
  { label: "Disney Plus", id: "3904" },
  { label: "Hulu", id: "453" },
];

const GENRES = [
  { label: "Action", id: "28" },
  { label: "Adventure", id: "12" },
  { label: "Animation", id: "16" },
  { label: "Comedy", id: "35" },
  { label: "Crime", id: "80" },
  { label: "Documentary", id: "99" },
  { label: "Drama", id: "18" },
  { label: "Family", id: "10751" },
  { label: "Fantasy", id: "14" },
  { label: "Horror", id: "27" },
  { label: "Romance", id: "10749" },
  { label: "Sci-Fi", id: "878" },
  { label: "Thriller", id: "53" },
];

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

const COUNTRIES = [
  { label: "United States", code: "US" },
  { label: "United Kingdom", code: "GB" },
  { label: "Japan", code: "JP" },
  { label: "South Korea", code: "KR" },
  { label: "India", code: "IN" },
  { label: "France", code: "FR" },
  { label: "Canada", code: "CA" },
  { label: "Australia", code: "AU" },
  { label: "Germany", code: "DE" },
  { label: "Spain", code: "ES" },
];

export function FilterDrawer() {
  const { filterOpen, closeFilter } = useUIStore();
  const { type, sort, network, rating, genre, year, country, setFilter, clearFilters } = useFilterStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeFilter}
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          filterOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[32px] border-t border-border bg-[#0A0A0A] shadow-2xl transition-transform duration-300 sm:inset-auto sm:right-6 sm:top-24 sm:w-96 sm:rounded-3xl sm:border",
          filterOpen ? "translate-y-0 sm:translate-y-0" : "translate-y-full sm:translate-y-8 sm:opacity-0 sm:pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-5 pb-4">
          <h2 className="text-lg font-bold text-white">Filters</h2>
          <button
            onClick={closeFilter}
            className="grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
          <div className="flex flex-col gap-5">
            {/* Type & Genre Row */}
            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="Type"
                value={type}
                onChange={(v) => setFilter("type", v)}
                options={[
                  { label: "All Types", value: "" },
                  { label: "Movies", value: "movie" },
                  { label: "TV Shows", value: "tv" },
                  { label: "Anime", value: "anime" },
                  { label: "Drama", value: "drama" },
                  { label: "Manga", value: "manga" },
                ]}
              />
              <SelectBox
                label="Genre"
                value={genre}
                onChange={(v) => setFilter("genre", v)}
                options={[{ label: "Any Genre", value: "" }, ...GENRES.map(g => ({ label: g.label, value: g.id }))]}
              />
            </div>

            {/* Sort & Year Row */}
            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="Sort By"
                value={sort}
                onChange={(v) => setFilter("sort", v)}
                options={[
                  { label: "Popular", value: "Popular" },
                  { label: "Top Rated", value: "Top Rated" },
                  { label: "Title A-Z", value: "Title A-Z" },
                  { label: "Title Z-A", value: "Title Z-A" },
                  { label: "Latest Release", value: "Latest Release" },
                  { label: "Oldest Release", value: "Oldest Release" },
                  { label: "Revenue", value: "Revenue" },
                ]}
              />
              <SelectBox
                label="Year"
                value={year}
                onChange={(v) => setFilter("year", v)}
                options={[{ label: "Any Year", value: "" }, ...YEARS.map(y => ({ label: y, value: y }))]}
              />
            </div>

            {/* Networks & Country Row */}
            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="Networks"
                value={network}
                onChange={(v) => setFilter("network", v)}
                options={[{ label: "All Networks", value: "" }, ...NETWORKS.map(n => ({ label: n.label, value: n.id }))]}
              />
              <SelectBox
                label="Country"
                value={country}
                onChange={(v) => setFilter("country", v)}
                options={[{ label: "Any Country", value: "" }, ...COUNTRIES.map(c => ({ label: c.label, value: c.code }))]}
              />
            </div>

            {/* Ratings Row */}
            <div className="grid grid-cols-2 gap-3">
              <SelectBox
                label="Ratings"
                value={rating}
                onChange={(v) => setFilter("rating", v)}
                options={[
                  { label: "Any Rating", value: "" },
                  { label: "9+ ⭐", value: "9" },
                  { label: "8+ ⭐", value: "8" },
                  { label: "7+ ⭐", value: "7" },
                  { label: "6+ ⭐", value: "6" },
                  { label: "5+ ⭐", value: "5" },
                  { label: "4+ ⭐", value: "4" },
                ]}
              />
              <button
                onClick={clearFilters}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/20 text-sm font-semibold text-red-500 transition hover:bg-red-500/30"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-border bg-[#1A1A1A] px-4 py-2 pr-10 text-sm text-white focus:border-primary focus:outline-none"
      >
        {value === "" && <option value="" disabled hidden>{label}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1A1A1A] text-white">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary"
      />
    </div>
  );
}
