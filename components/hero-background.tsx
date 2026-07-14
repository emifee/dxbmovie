"use client";

import { useState, useEffect } from "react";
import { tmdbImage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import type { Movie } from "@/lib/types";

/**
 * Performance-optimized hero background that only loads 2 images at a time
 * (current + next) instead of all 20. Uses native <img> with TMDB CDN
 * directly to avoid routing every image through the Next.js optimizer.
 *
 * Now also displays the current backdrop movie's title, year, and genres
 * at the bottom of the hero (Netflix-style) so first-time visitors immediately
 * understand what they're looking at.
 */
export function HeroBackground({
  movies,
  children,
  onMovieClick,
}: {
  movies: Movie[];
  children: React.ReactNode;
  onMovieClick?: (movie: Movie) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const [titleVisible, setTitleVisible] = useState(true);

  // Filter movies that have both a backdrop and a poster, show up to 20
  const validMovies = movies.filter((m) => m.backdropPath && m.posterPath).slice(0, 20);
  const currentMovie = validMovies[currentIndex] ?? null;

  // Advance the slide every 7 seconds (was 5 — gives the title info time to register)
  useEffect(() => {
    if (validMovies.length <= 1) return;
    const interval = setInterval(() => {
      // Fade title out briefly before the image swaps
      setTitleVisible(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % validMovies.length);
        setTitleVisible(true);
      }, 600);
    }, 7000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validMovies.length]);

  // Preload only the NEXT image so transitions are seamless
  useEffect(() => {
    if (validMovies.length <= 1) return;
    const nextIdx = (currentIndex + 1) % validMovies.length;
    const nextMovie = validMovies[nextIdx];
    if (!nextMovie) return;

    const desktopUrl = tmdbImage(nextMovie.backdropPath ?? null, "w1280") || "";
    const mobileUrl = tmdbImage(nextMovie.posterPath ?? null, "w780") || "";

    [desktopUrl, mobileUrl].forEach((url) => {
      if (url && !loadedUrls.has(url)) {
        const img = new Image();
        img.src = url;
        img.onload = () => setLoadedUrls((prev) => new Set(prev).add(url));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, validMovies.length]);

  // Only render 3 slides: current, next, previous
  const visibleIndices = new Set<number>();
  visibleIndices.add(currentIndex);
  if (validMovies.length > 1) {
    visibleIndices.add((currentIndex + 1) % validMovies.length);
    visibleIndices.add((currentIndex - 1 + validMovies.length) % validMovies.length);
  }

  const year = currentMovie?.year || null;
  const rating = currentMovie?.rating ?? currentMovie?.voteAverage ?? 0;

  return (
    <div className="pointer-events-none relative w-full pt-[max(2rem,env(safe-area-inset-top))] pb-16 min-h-[72vh] flex flex-col justify-between">
      {/* Background Images Layer */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        {/* Placeholder shimmer before first image loads */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent animate-pulse" />
        {validMovies.map((movie, idx) => {
          if (!visibleIndices.has(idx)) return null;

          const bgUrlDesktop = tmdbImage(movie.backdropPath ?? null, "w1280") || "";
          const bgUrlMobile = tmdbImage(movie.posterPath ?? null, "w780") || "";

          if (!bgUrlDesktop || !bgUrlMobile) return null;

          return (
            <div
              key={movie.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                idx === currentIndex ? "opacity-100" : "opacity-0"
              )}
            >
              <picture>
                <source media="(min-width: 768px)" srcSet={bgUrlDesktop} />
                <img
                  src={bgUrlMobile}
                  alt={movie.title}
                  loading={idx === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={idx === 0 ? "high" : "low"}
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              </picture>
            </div>
          );
        })}

        {/* Cinematic gradient overlays — pointer-events-none so pills/buttons beneath remain clickable */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent" />
        {/* Stronger bottom gradient so text is always legible */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background via-background/80 to-transparent" />
        {/* Side vignette for wide screens */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-background/60 to-transparent hidden lg:block" />
      </div>

      {/* Hero Headline — top of hero */}
      <div className="pointer-events-auto relative z-10 w-full px-5 lg:px-10 pt-4">
        {children}
      </div>

      {/* Current Movie Callout — bottom of hero, Netflix-style */}
      {currentMovie && (
        <div
          className={cn(
            "pointer-events-auto relative z-10 px-5 lg:px-10 pb-2 transition-all duration-500",
            titleVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}
        >
          <div className="flex items-end gap-4 max-w-lg">
            {/* Small poster thumbnail */}
            {currentMovie.posterPath && (
              <div className="shrink-0 w-12 h-18 rounded-lg overflow-hidden border border-white/10 shadow-lg hidden sm:block"
                style={{ height: "4.5rem" }}>
                <img
                  src={tmdbImage(currentMovie.posterPath, "w185") || ""}
                  alt={currentMovie.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Movie title */}
              <h2 className="text-white font-bold text-lg leading-tight line-clamp-1 drop-shadow-lg">
                {currentMovie.title}
              </h2>

              {/* Year + rating */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {year && (
                  <span className="text-xs text-white/60">{year}</span>
                )}
                {rating > 0 && (
                  <span className="text-xs text-amber-400 font-medium">
                    ★ {Number(rating).toFixed(1)}
                  </span>
                )}
              </div>

              {/* Overview teaser */}
              {currentMovie.overview && (
                <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">
                  {currentMovie.overview}
                </p>
              )}
            </div>

            {/* More info button */}
            {onMovieClick && (
              <button
                onClick={() => onMovieClick(currentMovie)}
                className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/20 hover:text-white active:scale-95"
                aria-label={`More info about ${currentMovie.title}`}
              >
                <Info size={12} />
                <span className="hidden sm:inline">More info</span>
              </button>
            )}
          </div>

          {/* Slide indicator dots */}
          {validMovies.length > 1 && (
            <div className="flex gap-1 mt-3">
              {validMovies.slice(0, 8).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-full transition-all duration-500",
                    i === currentIndex
                      ? "w-4 h-1 bg-primary"
                      : "w-1 h-1 bg-white/30"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
