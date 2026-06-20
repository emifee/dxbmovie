"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Play, Loader2 } from "lucide-react";
import type { Movie } from "@/lib/types";
import { tmdbImage } from "@/lib/utils";
import { useUIStore } from "@/lib/store";

export function RecommendationCards({ movies }: { movies: Movie[] }) {
  const openDetail = useUIStore((s) => s.openDetail);
  const openTrailer = useUIStore((s) => s.openTrailer);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleClick = async (movie: Movie) => {
    setLoadingId(movie.id);
    try {
      const res = await fetch(`/api/movies/trailer/${movie.id}?type=${movie.mediaType || "movie"}`);
      const data = await res.json();
      if (data.key) {
        if (useUIStore.getState().chatOpen) {
          useUIStore.getState().openChatTrailer(data.key, movie.title, movie.id, movie.mediaType || "movie");
        } else {
          openTrailer(data.key, movie.title, movie.id, movie.mediaType || "movie");
        }
      } else {
        openDetail(movie);
      }
    } catch {
      openDetail(movie);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="no-scrollbar -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2">
      {movies.map((movie) => {
        const poster = tmdbImage(movie.posterPath, "w342");
        const isLoading = loadingId === movie.id;
        
        return (
          <button
            key={movie.id}
            onClick={() => handleClick(movie)}
            disabled={loadingId !== null}
            className={`w-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-raised text-left transition duration-200 hover:border-primary/60 hover:shadow-glow ${isLoading ? "opacity-70" : "active:scale-95"}`}
          >
            {/* Poster */}
            <div className="relative aspect-[2/3] w-full bg-surface">
              {poster ? (
                <Image
                  src={poster}
                  alt={movie.title}
                  fill
                  sizes="144px"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-text-secondary text-xs px-2 text-center">
                  {movie.title}
                </div>
              )}
              {/* Rating badge */}
              <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                {(movie.rating ?? movie.voteAverage ?? 0).toFixed(1)}
              </span>
              {/* Play overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
                  <Play size={16} className="ml-0.5 fill-black text-black" />
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-2.5">
              <p className="line-clamp-1 text-xs font-semibold text-white">{movie.title}</p>
              <p className="text-[11px] text-text-secondary">{movie.year}</p>
              <span className="mt-2 flex items-center justify-center gap-1 rounded-full bg-gradient-primary py-1.5 text-[10px] font-medium text-white">
                {isLoading ? (
                  <Loader2 size={9} className="animate-spin text-white" />
                ) : (
                  <Play size={9} className="fill-white" />
                )}
                {isLoading ? "Loading..." : "Watch & trailer"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
