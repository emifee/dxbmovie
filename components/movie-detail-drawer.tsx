"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Star, Play, Plus, Sparkles, Check } from "lucide-react";
import { useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { tmdbImage } from "@/lib/utils";
import type { Movie } from "@/lib/types";

/**
 * Bottom-sheet movie detail. Opened from the browse grid or inline rec cards.
 * Shows poster, meta, overview, genres, cast, watch providers, a YouTube
 * trailer button, "Add to Watchlist" and "Ask AI about this".
 */
export function MovieDetailDrawer() {
  const movie = useUIStore((s) => s.detailMovie);
  const close = useUIStore((s) => s.closeDetail);
  const openChat = useUIStore((s) => s.openChat);
  const openTrailer = useUIStore((s) => s.openTrailer);
  const openDetail = useUIStore((s) => s.openDetail);
  const { data: session } = useSession();

  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [watchlistState, setWatchlistState] = useState<"idle" | "adding" | "added">("idle");
  const [relatedMovies, setRelatedMovies] = useState<Movie[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [fullDetails, setFullDetails] = useState<{ genres: string[]; providers: any[]; cast: any[] } | null>(null);

  useEffect(() => {
    document.body.style.overflow = movie ? "hidden" : "";
    if (!movie) { 
      setTrailerKey(undefined); 
      setWatchlistState("idle"); 
      setRelatedMovies([]);
      setFullDetails(null);
      return; 
    }

    setWatchlistState("idle");

    // Fetch Trailer
    if (movie.trailerKey) { 
      setTrailerKey(movie.trailerKey); 
    } else {
      setTrailerKey(undefined);
      fetch(`/api/movies/trailer/${movie.id}?type=${movie.mediaType}`)
        .then((r) => r.json())
        .then((d: { key: string | null }) => setTrailerKey(d.key ?? null))
        .catch(() => setTrailerKey(null));
    }

    // Fetch Related
    setRelatedLoading(true);
    fetch(`/api/movies/related?id=${movie.id}&type=${movie.mediaType}`)
      .then((r) => r.json())
      .then((d: Movie[]) => setRelatedMovies(Array.isArray(d) ? d : []))
      .catch(() => setRelatedMovies([]))
      .finally(() => setRelatedLoading(false));

    // Fetch Full Details
    fetch(`/api/movies/detail?id=${movie.id}&type=${movie.mediaType}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Fetch failed");
        return r.json();
      })
      .then((d) => setFullDetails(d))
      .catch(() => setFullDetails(null));

    return () => { document.body.style.overflow = ""; };
  }, [movie]);

  async function addToWatchlist() {
    if (!movie || watchlistState !== "idle") return;

    if (!session?.user) {
      window.location.href = "/login";
      return;
    }

    setWatchlistState("adding");
    try {
      const res = await fetch("/api/user/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movie }),
      });
      if (res.ok) {
        setWatchlistState("added");
      } else {
        setWatchlistState("idle");
      }
    } catch {
      setWatchlistState("idle");
    }
  }

  if (!movie) return null;

  const poster = tmdbImage(movie.posterPath, "w342");

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      {/* Scrim */}
      <button
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative mx-auto max-h-[90dvh] w-full max-w-app animate-slide-up overflow-y-auto rounded-t-3xl border-t border-border bg-surface lg:max-h-[85vh] lg:max-w-lg lg:animate-fade-in lg:rounded-3xl lg:border">
        {/* Grab handle + close */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-5 pb-2 pt-3 backdrop-blur">
          <span className="mx-auto h-1 w-10 rounded-full bg-border" />
          <button
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-8">
          {/* Poster + meta */}
          <div className="flex gap-4">
            <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-2xl border border-border">
              {poster && (
                <Image src={poster} alt={movie.title} fill sizes="112px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-xl font-bold leading-tight text-white">{movie.title}</h2>
              <p className="mt-1 text-sm text-text-secondary">{movie.year}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-black">
                <Star size={12} className="fill-amber-500 text-amber-500" />
                {(movie.rating ?? movie.voteAverage ?? 0).toFixed(1)}
              </span>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(fullDetails?.genres || movie.genres || []).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-red-900/50 bg-red-950/50 px-2.5 py-1 text-[11px] font-medium text-red-400"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Overview */}
          <p className="mt-5 text-sm leading-relaxed text-text-secondary">{movie.overview}</p>

          {/* Cast */}
          {(fullDetails?.cast?.length ?? movie.cast?.length ?? 0) > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Cast
              </p>
              <div className="mt-3 no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-2">
                {fullDetails?.cast ? (
                  fullDetails.cast.map((c: any) => (
                    <div key={c.name} className="flex shrink-0 items-center gap-3">
                      {c.profilePath ? (
                        <div className="relative h-12 w-12 overflow-hidden rounded-full border border-border">
                          <Image src={c.profilePath} alt={c.name} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-text-secondary">
                          <span className="text-sm font-semibold">{c.name.charAt(0)}</span>
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">{c.name}</span>
                        <span className="text-xs text-text-secondary">{c.character || "Cast"}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white">{(movie.cast || []).join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {/* Where to watch */}
          {fullDetails?.providers && fullDetails.providers.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Where to watch
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {fullDetails.providers.map((p: any) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 pr-4"
                  >
                    {p.logoPath && (
                      <div className="relative h-5 w-5 overflow-hidden rounded-full">
                        <Image src={p.logoPath} alt={p.name} fill className="object-cover" />
                      </div>
                    )}
                    <span className="text-xs font-medium text-white">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trailer */}
          {trailerKey === undefined ? (
            <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-raised py-3 text-sm text-text-secondary animate-pulse">
              <Play size={16} />
              Loading trailer…
            </div>
          ) : trailerKey ? (
            <button
              type="button"
              onClick={() => openTrailer(trailerKey, movie.title, movie.id, movie.mediaType)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-raised py-3 text-sm font-medium text-white transition hover:border-primary/60"
            >
              <Play size={16} className="fill-white" />
              Watch trailer
            </button>
          ) : null}

          {/* Actions */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={addToWatchlist}
              disabled={watchlistState !== "idle"}
              className={`flex items-center justify-center gap-2 rounded-full border py-3 text-sm font-medium transition ${
                watchlistState === "added"
                  ? "border-green-500/60 bg-green-500/10 text-green-400"
                  : "border-border bg-surface-raised text-white hover:border-primary/60"
              }`}
            >
              {watchlistState === "adding" ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Adding…
                </>
              ) : watchlistState === "added" ? (
                <>
                  <Check size={16} />
                  Added ✓
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Watchlist
                </>
              )}
            </button>
            <button
              onClick={() => {
                close();
                openChat(movie);
              }}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-primary py-3 text-sm font-medium text-white transition active:scale-[0.98]"
            >
              <Sparkles size={16} />
              Ask AI about this
            </button>
          </div>

          {/* Related Movies */}
          {(relatedMovies.length > 0 || relatedLoading) && (
            <div className="mt-8 border-t border-border/50 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                More like this
              </p>
              <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-2">
                {relatedLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] w-28 shrink-0 animate-pulse rounded-xl border border-border bg-surface-raised" />
                  ))
                ) : (
                  relatedMovies.map((rm) => {
                    const rPoster = tmdbImage(rm.posterPath, "w185");
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => openDetail(rm)}
                        className="group relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-primary/50"
                      >
                        {rPoster ? (
                          <Image src={rPoster} alt={rm.title} fill sizes="112px" className="object-cover transition duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full flex-col p-2">
                            <span className="line-clamp-3 text-[10px] font-bold text-white">{rm.title}</span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-6">
                           <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white">
                             <Star size={10} className="fill-amber-500 text-amber-500" />
                             {(rm.rating ?? rm.voteAverage ?? 0).toFixed(1)}
                           </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
