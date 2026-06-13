"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import type { Movie } from "@/lib/types";
import { tmdbImage } from "@/lib/utils";
import { useUIStore } from "@/lib/store";

/**
 * Poster card for the 2-column browse grid. Poster fills the card, the title
 * sits over a bottom gradient fade, and a white rating pill floats top-right.
 * Tapping opens the movie detail drawer.
 */
export function MoviePosterCard({ movie }: { movie: Movie }) {
  const openDetail = useUIStore((s) => s.openDetail);
  const poster = tmdbImage(movie.posterPath);

  return (
    <button
      onClick={() => openDetail(movie)}
      className="group relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border bg-surface text-left transition duration-200 hover:border-primary/50 hover:shadow-glow"
    >
      {poster ? (
        <Image
          src={poster}
          alt={movie.title}
          fill
          sizes="(max-width: 430px) 50vw, 215px"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-surface-raised to-background text-text-secondary">
          <div className="flex flex-col items-center gap-2 opacity-50">
            <Star size={24} className="opacity-20" />
            <span className="text-[10px] font-medium uppercase tracking-wider">No Cover</span>
          </div>
        </div>
      )}

      {/* Rating pill */}
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-black">
        <Star size={11} className="fill-amber-500 text-amber-500" />
        {(movie.rating ?? movie.voteAverage ?? 0).toFixed(1)}
      </span>

      {/* Bottom gradient + title */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 pt-8">
        <p className="line-clamp-2 text-sm font-semibold text-white">{movie.title}</p>
        <p className="text-xs text-text-secondary">{movie.year}</p>
      </div>
    </button>
  );
}
