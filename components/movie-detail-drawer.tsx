"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Star, Play, Plus, Sparkles, Check, Share2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { useAccountStore } from "@/lib/account-store";
import { tmdbImage, cn } from "@/lib/utils";
import { setPendingAction } from "@/lib/pending-actions";
import { trackMovieView, trackNotInterested } from "@/lib/anon-prefs";
import { trackEvent } from "@/lib/analytics";
import { getWatchLink } from "@/lib/watch-links";
import type { Movie, MovieProduct } from "@/lib/types";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Bottom-sheet movie detail. Opened from the browse grid or inline rec cards.
 * Cinematic backdrop hero with the poster breaking the fold, then meta,
 * overview, genres, cast, watch providers, a YouTube trailer button,
 * "Add to Watchlist" and "Ask {companion} about this".
 */
export function MovieDetailDrawer() {
  const movie = useUIStore((s) => s.detailMovie);
  const close = useUIStore((s) => s.closeDetail);
  const openChat = useUIStore((s) => s.openChat);
  const openTrailer = useUIStore((s) => s.openTrailer);
  const openDetail = useUIStore((s) => s.openDetail);
  const { data: session } = useSession();

  // Companions are user-named in the profile wizard ("e.g. Sonia" / "e.g. Adam"),
  // so address the user's own companion rather than hardcoding a name. Mirrors
  // chat-drawer's assistantName; "Sonia" is the persona shown before sign-in.
  const aiCompanion = useAccountStore((s) => s.aiCompanion);
  const accountSignedIn = useAccountStore((s) => s.signedIn);
  const assistantName = !accountSignedIn || !aiCompanion ? "Sonia" : aiCompanion.name;

  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [watchlistState, setWatchlistState] = useState<"idle" | "adding" | "added">("idle");
  const [relatedMovies, setRelatedMovies] = useState<Movie[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [fullDetails, setFullDetails] = useState<{ genres: string[]; providers: any[]; cast: any[] } | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [products, setProducts] = useState<MovieProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  useEffect(() => {
    document.body.style.overflow = movie ? "hidden" : "";
    if (!movie) {
      setTrailerKey(undefined);
      setWatchlistState("idle");
      setRelatedMovies([]);
      setFullDetails(null);
      setOverviewExpanded(false);
      return;
    }

    setWatchlistState("idle");
    // Reset on every title change — openDetail can swap movies without closing
    setOverviewExpanded(false);

    // Fetch Products
    setProductsLoading(true);
    fetch(`/api/movies/${movie.id}/products`)
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d.products) ? d.products : []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));

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
        .then((d) => setFullDetails({
          genres: d.genres || [],
          providers: d.providers || [],
          cast: d.enrichedCast || d.cast || [],
        }))
        .catch(() => setFullDetails(null));
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
  const backdrop = tmdbImage(movie.backdropPath ?? null, "w780") ?? tmdbImage(movie.posterPath, "w780");
  const rating = movie.rating ?? movie.voteAverage ?? 0;

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
    <div className="fixed inset-0 z-[70] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      {/* Scrim */}
      <button
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Sheet */}
      <div className="no-scrollbar relative mx-auto max-h-[90dvh] w-full max-w-app animate-slide-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-surface shadow-2xl shadow-black/60 lg:max-h-[85vh] lg:max-w-lg lg:animate-fade-in lg:rounded-3xl lg:border">
        {/* Floating controls — pinned above the hero while the sheet scrolls */}
        <div className="sticky top-0 z-20 h-0">
          <div className="flex items-start justify-end px-4 pt-4">
            <span className="pointer-events-none absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-white/40" />
            <div className="flex gap-2">
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
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
              >
                <Share2 size={16} />
              </button>
              <button
                onClick={close}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Cinematic hero — the artwork leads, the card rides over it */}
        <div className="relative h-[280px] w-full overflow-hidden bg-surface-raised">
          {backdrop ? (
            <Image
              src={backdrop}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 512px"
              priority
              className="object-cover"
            />
          ) : (
            /* No artwork at all — a branded wash beats the black void that a bare
               <Image> leaves when both backdrop and poster are missing. */
            <>
              <div className="absolute inset-0 bg-gradient-primary opacity-25" />
              <div className="absolute inset-0 grid place-items-center px-10">
                <span className="text-center text-2xl font-bold leading-tight text-white/25">
                  {movie.title}
                </span>
              </div>
            </>
          )}
          {/* Base stays dark so the card edge reads; the top is kept light so the
              artwork shows through — the controls get their own local scrim instead. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/20" />
        </div>

        {/* Content card riding over the artwork */}
        <div className="relative -mt-14 rounded-t-3xl border-t border-white/[0.12] bg-surface px-5 pb-8 pt-5 shadow-[0_-24px_48px_rgba(0,0,0,0.55)]">
          {/* Poster + meta */}
          <div className="flex gap-4">
            <div className="relative -mt-[76px] aspect-[2/3] w-[104px] shrink-0 overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-white/15 shadow-xl shadow-black/70">
              {poster ? (
                <Image src={poster} alt={movie.title} fill sizes="104px" className="object-cover" />
              ) : (
                /* Titles with no poster showed a hollow outlined box — show the
                   title instead so the slot always looks intentional. */
                <div className="flex h-full w-full items-center justify-center p-2">
                  <span className="line-clamp-4 text-center text-[11px] font-bold leading-tight text-white/40">
                    {movie.title}
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-bold leading-[1.15] tracking-tight text-white">{movie.title}</h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-300">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {rating.toFixed(1)}
                </span>
                {movie.year && (
                  <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-white/70">
                    {movie.year}
                  </span>
                )}
                <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-white/70">
                  {movie.mediaType === "tv" ? "Series" : "Film"}
                </span>
                {(fullDetails?.genres || movie.genres || []).slice(0, 2).map((g) => (
                  <span
                    key={g}
                    className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-white/70"
                  >
                    {g}
                  </span>
                ))}
              </div>
          </div>
        </div>

          {/* Actions */}
          <div className="mt-5 space-y-3">
            {/* Primary: Ask the companion */}
            <button
              onClick={() => {
                close();
                openChat(movie);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary py-3.5 text-sm font-bold text-white transition active:scale-[0.98] shadow-glow hover:shadow-glow-lg"
            >
              <Sparkles size={16} />
              Ask {assistantName} about this
            </button>

            {/* Secondary: Grid for Watchlist & Trailer */}
            <div className="grid grid-cols-2 gap-3">
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

              {/* Trailer Button */}
              {trailerKey === undefined ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-raised py-3 text-sm text-text-secondary animate-pulse">
                  <Play size={16} />
                  Trailer
                </div>
              ) : trailerKey ? (
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("trailer_played", { source: "homepage_modal" });
                    openTrailer(trailerKey, movie.title, movie.id, movie.mediaType);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-raised py-3 text-sm font-medium text-white transition hover:border-primary/60"
                >
                  <Play size={16} className="fill-white" />
                  Trailer
                </button>
              ) : (
                <div className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-raised/50 py-3 text-sm text-text-secondary opacity-50 cursor-not-allowed">
                  <Play size={16} />
                  No trailer
                </div>
              )}
            </div>
          </div>

          {/* Overview */}
          {movie.overview && (
            <div className="mt-7">
              <SectionLabel>Storyline</SectionLabel>
              <p
                className={cn(
                  "mt-3 text-[13.5px] leading-relaxed text-white/70",
                  !overviewExpanded && "line-clamp-3"
                )}
              >
                {movie.overview}
              </p>
              {movie.overview.length > 180 && (
                <button
                  type="button"
                  onClick={() => setOverviewExpanded(!overviewExpanded)}
                  className="mt-2 text-[11px] font-bold uppercase tracking-wide text-primary transition hover:opacity-80"
                >
                  {overviewExpanded ? "Show Less" : "Read More"}
                </button>
              )}
            </div>
          )}

          {/* Cast */}
          <div className="mt-7">
            <SectionLabel>Cast &amp; Crew</SectionLabel>
            <div className="mt-4 no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-4 scrollbar-hide">
              {!fullDetails ? (
                // Skeleton while loading
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex w-[76px] shrink-0 flex-col gap-2">
                    <Skeleton className="aspect-[3/4] w-full rounded-xl" />
                    <Skeleton className="h-2.5 w-14 rounded" />
                    <Skeleton className="h-2 w-10 rounded" />
                  </div>
                ))
              ) : fullDetails.cast?.length > 0 ? (
                fullDetails.cast.map((c: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => useUIStore.getState().openActor(c.id || c.name)}
                    className="group flex w-[76px] shrink-0 flex-col gap-2 text-left transition active:scale-95"
                  >
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface-raised ring-1 ring-white/10 transition duration-200 group-hover:ring-primary/70">
                      {c.profilePath ? (
                        <Image
                          src={c.profilePath}
                          alt={c.name}
                          fill
                          unoptimized
                          className="object-cover object-top transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white/30">
                          {c.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex w-full flex-col">
                      <span className="text-[11px] font-semibold leading-tight text-white line-clamp-2">{c.name}</span>
                      <span className="mt-0.5 text-[10px] leading-tight text-text-secondary line-clamp-1">{c.character}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-text-secondary">No cast info available</p>
              )}
            </div>
          </div>

          {/* Where to watch */}
          {!fullDetails ? (
            <div className="mt-7">
              <SectionLabel>Where to watch</SectionLabel>
              <div className="mt-4 flex gap-3">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-28 rounded-full" />
              </div>
            </div>
          ) : fullDetails.providers && fullDetails.providers.length > 0 && (
            <div className="mt-7">
              <SectionLabel>Where to watch</SectionLabel>
              <div className="mt-4 no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-4 scrollbar-hide">
                {fullDetails.providers.map((p: any) => {
                  const watchUrl = getWatchLink(p.name, movie.id, movie.title) ?? undefined;
                  const Wrapper = watchUrl ? "a" : "div";
                  return (
                    <Wrapper
                      key={p.name}
                      href={watchUrl}
                      target={watchUrl ? "_blank" : undefined}
                      rel={watchUrl ? "noopener noreferrer" : undefined}
                      onClick={() => {
                        if (watchUrl) {
                          trackEvent("watch_now_clicked", { provider: p.name });
                          const clickData = {
                            movieId: movie.id,
                            title: movie.title,
                            posterUrl: movie.posterPath,
                            provider: p.name,
                            clickedAt: Date.now(),
                          };
                          localStorage.setItem("dxb_last_watch_click", JSON.stringify(clickData));
                          if (status === "authenticated") {
                            fetch("/api/user/watch-click", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(clickData),
                            }).catch(() => {});
                          }
                        }
                      }}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3.5 transition hover:border-primary/60 hover:bg-white/[0.08]"
                    >
                      {p.logoPath && (
                        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                          <Image src={p.logoPath} alt={p.name} fill className="object-cover" />
                        </div>
                      )}
                      <span className="whitespace-nowrap text-xs font-medium text-white">{p.name}</span>
                    </Wrapper>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shop This Movie */}
          {(products.length > 0 || productsLoading) && (
            <div className="mt-8 border-t border-white/[0.07] pt-6">
              <SectionLabel>Shop This Movie</SectionLabel>
              <div className="no-scrollbar -mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-4">
                {productsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex w-[200px] shrink-0 flex-col gap-3 rounded-2xl bg-white/[0.02] p-3 ring-1 ring-white/10">
                      <Skeleton className="aspect-square w-full rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))
                ) : (
                  products.map((product) => (
                    <div
                      key={product.id}
                      className="group flex w-[200px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-white/[0.02] ring-1 ring-white/10 transition-all hover:bg-white/[0.04] hover:ring-white/20"
                    >
                      <div className="p-3 pb-0">
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/5">
                          <Image
                            src={product.image}
                            alt={product.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        <div className="mt-3 flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">
                            {product.category}
                          </span>
                          <h4 className="text-sm font-semibold leading-snug text-white line-clamp-2" title={product.title}>
                            {product.title}
                          </h4>
                          {product.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span className="text-xs font-medium text-amber-400">{product.rating}</span>
                              {product.reviewCount && (
                                <span className="text-[10px] text-white/40">({product.reviewCount})</span>
                              )}
                            </div>
                          )}
                          <div className="mt-1">
                            <span className="text-lg font-bold text-white">
                              {product.price} <span className="text-xs font-medium text-white/50">{product.currency}</span>
                            </span>
                            {product.originalPrice && (
                              <span className="ml-1.5 text-xs text-white/40 line-through">
                                {product.originalPrice}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 p-3 pt-0">
                        <a
                          href={product.affiliateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            // Track outbound click
                            const clickData = {
                              movieId: movie.id,
                              productId: product.id,
                              merchant: product.merchant,
                              source: "movie_detail_drawer",
                            };
                            trackEvent("product_clicked", clickData);
                            
                            fetch("/api/commerce/track-click", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(clickData),
                            }).catch(() => {});
                          }}
                          className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-black transition-transform active:scale-95"
                        >
                          View on {product.merchant}
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleNotInterested}
            className="mt-5 w-full rounded-full border border-white/[0.07] py-2.5 text-center text-[13px] font-medium text-text-secondary transition hover:border-white/15 hover:text-white/90"
          >
            Not interested in this?
          </button>

          {/* Related Movies */}
          {(relatedMovies.length > 0 || relatedLoading) && (
            <div className="mt-8 border-t border-white/[0.07] pt-6">
              <SectionLabel>More like this</SectionLabel>
              <div className="no-scrollbar -mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2">
                {relatedLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] w-28 shrink-0 rounded-xl" />
                  ))
                ) : (
                  relatedMovies.map((rm) => {
                    const rPoster = tmdbImage(rm.posterPath, "w185");
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => openDetail(rm)}
                        className="group relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 bg-surface text-left transition hover:ring-primary/50"
                      >
                        {rPoster ? (
                          <Image src={rPoster} alt={rm.title} fill sizes="112px" className="object-cover transition duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full flex-col p-2">
                            <span className="line-clamp-3 text-[10px] font-bold text-white">{rm.title}</span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-6">
                           <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                             <Star size={10} className="fill-amber-400 text-amber-400" />
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
