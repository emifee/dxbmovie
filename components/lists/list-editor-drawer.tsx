"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Search, Plus, Trash2, Globe, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";
import { tmdbImage, cn } from "@/lib/utils";
import type { UserList, UserListItem } from "@/lib/types";

const MIN_ITEMS = 10;
const MAX_ITEMS = 100;

interface Props {
  list: UserList | null; // null = creating new
  onClose: () => void;
  onSaved: (list: UserList) => void;
}

interface SearchResult {
  id: number;
  title: string;
  posterPath: string | null;
  mediaType: "movie" | "tv";
  year: string;
  rating: number;
}

export function ListEditorDrawer({ list, onClose, onSaved }: Props) {
  const [name, setName] = useState(list?.name || "");
  const [items, setItems] = useState<UserListItem[]>(list?.items || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        setSearchResults(
          (Array.isArray(data) ? data : data.results || []).slice(0, 8).map((m: any) => ({
            id: m.id,
            title: m.title || m.name || "Unknown",
            posterPath: m.posterPath || m.poster_path || null,
            mediaType: m.mediaType || m.media_type || "movie",
            year: (m.year || m.release_date || m.first_air_date || "").slice(0, 4),
            rating: Math.round(((m.rating || m.vote_average || 0) * 10)) / 10,
          }))
        );
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 350);
  }, []);

  function addItem(r: SearchResult) {
    if (items.length >= MAX_ITEMS) { setError(`Maximum ${MAX_ITEMS} items allowed.`); return; }
    if (items.find((i) => i.id === r.id)) return; // already added
    setItems((prev) => [...prev, { id: r.id, title: r.title, posterPath: r.posterPath, mediaType: r.mediaType, year: r.year, rating: r.rating }]);
    setError("");
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function save(publish: boolean) {
    if (!name.trim()) { setError("Please enter a list name."); return; }
    if (publish && items.length < MIN_ITEMS) {
      setError(`Add at least ${MIN_ITEMS} titles to publish your list.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      let res: Response;
      if (list?._id) {
        // Update existing
        res = await fetch(`/api/user/lists/${list._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, items, published: publish }),
        });
      } else {
        // Create new, then update with items
        const createRes = await fetch("/api/user/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!createRes.ok) { const d = await createRes.json(); setError(d.error || "Failed to create list."); setSaving(false); return; }
        const created = await createRes.json();
        res = await fetch(`/api/user/lists/${created._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, items, published: publish }),
        });
        if (res.ok) {
          onSaved({ ...created, name, items, published: publish, updatedAt: new Date().toISOString() } as UserList);
          return;
        }
      }
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to save."); return; }
      onSaved({ ...(list || { _id: "", userId: "", userName: null, slug: "", createdAt: "" }), name, items, published: publish, updatedAt: new Date().toISOString() } as UserList);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  }

  const isPublishable = items.length >= MIN_ITEMS;
  const itemCount = items.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl bg-[#141414] border border-white/10 shadow-2xl max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">{list ? "Edit List" : "Create New List"}</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {itemCount < MIN_ITEMS
                ? `Add ${MIN_ITEMS - itemCount} more title${MIN_ITEMS - itemCount !== 1 ? "s" : ""} to publish`
                : `${itemCount} title${itemCount !== 1 ? "s" : ""} · Ready to publish!`}
            </p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* List Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">List Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "My Top Favorite Male Lead Performances of 2018"'
              maxLength={120}
              className="w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary transition"
            />
          </div>

          {/* Search to add */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">Search & Add Titles</label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search movies or TV shows..."
                className="w-full rounded-2xl bg-white/[0.06] border border-white/10 pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary transition"
              />
            </div>

            {/* Search results */}
            {(searchLoading || searchResults.length > 0) && (
              <div className="mt-2 rounded-2xl border border-white/10 bg-black/40 overflow-hidden divide-y divide-white/5">
                {searchLoading && (
                  <div className="px-4 py-3 text-sm text-white/40">Searching...</div>
                )}
                {searchResults.map((r) => {
                  const alreadyAdded = items.some((i) => i.id === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addItem(r)}
                      disabled={alreadyAdded || items.length >= MAX_ITEMS}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                        alreadyAdded ? "opacity-40 cursor-default" : "hover:bg-white/5"
                      )}
                    >
                      <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded-lg bg-white/5">
                        {r.posterPath && (
                          <Image src={tmdbImage(r.posterPath, "w92") as string} alt={r.title} fill className="object-cover" unoptimized />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{r.title}</p>
                        <p className="text-xs text-white/40">{r.year} · {r.mediaType === "tv" ? "TV Show" : "Movie"}</p>
                      </div>
                      {alreadyAdded
                        ? <CheckCircle2 size={16} className="shrink-0 text-primary" />
                        : <Plus size={16} className="shrink-0 text-white/40" />
                      }
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current items */}
          {items.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  Your List ({itemCount}/{MAX_ITEMS})
                </label>
                {/* Progress bar */}
                <span className={cn("text-xs font-medium", isPublishable ? "text-emerald-400" : "text-amber-400")}>
                  {isPublishable ? "✅ Ready!" : `${itemCount}/${MIN_ITEMS} min`}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mb-3 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={cn("h-full rounded-full transition-all", isPublishable ? "bg-emerald-400" : "bg-amber-400")}
                  style={{ width: `${Math.min((itemCount / MIN_ITEMS) * 100, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 group">
                    <span className="w-5 text-right text-xs text-white/30 shrink-0">{idx + 1}</span>
                    <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded-md bg-white/5">
                      {item.posterPath && (
                        <Image src={tmdbImage(item.posterPath, "w92") as string} alt={item.title} fill className="object-cover" unoptimized />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-white/40">{item.year} · {item.mediaType === "tv" ? "TV" : "Movie"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 transition grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/50 hover:text-rose-400 hover:bg-white/20"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3">
              <AlertCircle size={15} className="shrink-0 text-rose-400" />
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Lock size={14} />
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving || !isPublishable || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <Globe size={14} />
            {saving ? "Saving..." : "Publish List"}
          </button>
        </div>
      </div>
    </div>
  );
}
