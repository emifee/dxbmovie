"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Trash2, Sparkles, Loader2 } from "lucide-react";
import type { Movie } from "@/lib/types";
import { tmdbImage } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onRemoved?: () => void;
}

export function TasteFeedbackModal({ onClose, onRemoved }: Props) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/user/watchlist")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMovies(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRemove(movie: Movie) {
    setRemovingId(movie.id);
    try {
      await fetch(`/api/user/watchlist?id=${movie.id}`, { method: "DELETE" });
      setMovies((prev) => prev.filter((m) => m.id !== movie.id));
      if (onRemoved) onRemoved();
    } catch {}
    setRemovingId(null);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-h-[85vh] sm:max-w-md flex flex-col rounded-t-3xl sm:rounded-3xl border border-border bg-surface shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              Sonia was wrong?
            </h3>
            <p className="text-xs text-text-secondary mt-1">Remove a movie you don't actually like to improve accuracy.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-surface-raised p-2 text-text-secondary hover:text-white transition">
            <X size={16} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : movies.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <p className="text-sm text-text-secondary">Your profile is empty.</p>
              <p className="text-xs text-white/40 mt-1">Add movies to your watchlist first.</p>
            </div>
          ) : (
            movies.map((m) => {
              const poster = tmdbImage(m.posterPath, "w185");
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface-raised p-3 pr-4 transition hover:bg-white/5">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-black/50">
                    {poster && <Image src={poster} alt={m.title} fill className="object-cover" unoptimized />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{m.title}</p>
                    <p className="text-xs text-text-secondary">{m.year}</p>
                  </div>
                  <button 
                    onClick={() => handleRemove(m)}
                    disabled={removingId === m.id}
                    className="shrink-0 p-2 text-text-secondary hover:text-red-400 disabled:opacity-50 transition"
                    title="Remove from profile"
                  >
                    {removingId === m.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
