"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Star, Play, Plus, Sparkles, Check, Share2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { tmdbImage } from "@/lib/utils";
import { setPendingAction } from "@/lib/pending-actions";
import { trackMovieView, trackNotInterested } from "@/lib/anon-prefs";
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

    // Fetch Full Details (skip if already seeded from deep-link)
    if (!(movie as any).enrichedCast) {
      fetch(`/api/movies/detail?id=${movie.id}&type=${movie.mediaType}`)
        .then(async (r) => {
          if (!r.ok) throw new Error("Fetch failed");
          return r.json();
        })
        .then((d) =\u003e setFullDetails({
          genres: d.genres || [],
          providers: d.providers || [],
          cast: d.enrichedCast || d.cast || [],
        }))
        .catch(() =\u003e setFullDetails(null));
    } else {
      // Data already came from the detail API (deep-link), use it immediately
      setFullDetails({
        genres: (movie as any).genres || [],
        providers: (movie as any).providers || [],
        cast: (movie as any).enrichedCast || [],
      });
    }

    return () => { document.body.style.overflow = ""; };
  }, [movie]);

  async function addToWatchlist() {
    if (!movie || watchlistState !== "idle") return;

    if (!session?.user) {
      setPendingAction({ type: "add_watchlist", movie });
      useUIStore.getState().openAuthGate();
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

  const handleNotInterested = async () => {
    // Optimistically update local tracking to hide it immediately across the app
    trackNotInterested(movie.id);
    
    // If logged in, sync it to the backend immediately
    if (status === "authenticated") {
      fetch("/api/user/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: movie.id, reaction: "dislike" }),
      }).catch(() => {});
    }

    // Force a page refresh of the feed since we don't have a global movie context to remove it instantly
    // In a full SPA this would be an event, but here we just close the drawer.
    // We can dispatch a custom event that `page.tsx` listens to!
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("dxb-not-interested", { detail: { movieId: movie.id } }));
    }
    close();
  };

  function handleRelatedClick(rm: Movie) {
    close();
    openDetail(rm);
  }

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
          <div className="flex gap-2 absolute right-4 top-3">
            <button
              type="button"
              aria-label="Share"
              onClick={() => {
                const url = `https://dxbmovie.online/m/${movie.id}?type=${movie.mediaType || "movie"}`;
                if (navigator.share) {
                  navigator.share({ title: `Check out ${movie.title}`, url }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(url);
                  alert("Link copied to clipboard!");
                }
              }}
              className="grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:text-white"
            >
              <Share2 size={16} />
            </button>
            <button
              onClick={close}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
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
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Cast &amp; Crew
            </p>
            <div className="mt-3 no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-4 scrollbar-hide">
              {!fullDetails ? (
                // Skeleton while loading
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-2">
                    <div className="h-20 w-20 rounded-full bg-white/5 animate-pulse" />
                    <div className="h-2.5 w-14 rounded bg-white/5 animate-pulse" />
                    <div className="h-2 w-10 rounded bg-white/5 animate-pulse" />
                  </div>
                ))
              ) : fullDetails.cast?.length > 0 ? (
                fullDetails.cast.map((c: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => useUIStore.getState().openActor(c.id || c.name)}
                    className="flex w-20 shrink-0 flex-col items-center gap-2 text-center transition hover:opacity-80 active:scale-95"
                  >
                    <div className="relative h-20 w-20 overflow-hidden rounded-full bg-surface-raised border border-white/10">
                      {c.profilePath ? (
                        <Image
                          src={c.profilePath}
                          alt={c.name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white/30">
                          {c.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex w-full flex-col">
                      <span className="text-[11px] font-medium leading-tight text-white line-clamp-2">{c.name}</span>
                      <span className="mt-0.5 text-[10px] leading-tight text-text-secondary line-clamp-2">{c.character}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-text-secondary">No cast info available</p>
              )}
            </div>
          </div>

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
          
          <button 
            type="button"
            onClick={handleNotInterested}
            className="mt-4 w-full text-center text-[13px] font-medium text-text-secondary transition hover:text-white/90"
          >
            Not interested in this?
          </button>

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
