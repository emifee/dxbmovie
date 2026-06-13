"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { tmdbImage } from "@/lib/utils";
import type { Movie } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HeroBackground({
  movies,
  children,
}: {
  movies: Movie[];
  children: React.ReactNode;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter movies that actually have a backdrop
  const validMovies = movies.filter((m) => m.backdropPath);

  useEffect(() => {
    if (validMovies.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % validMovies.length);
    }, 6000); // 6 seconds per backdrop
    return () => clearInterval(interval);
  }, [validMovies.length]);

  return (
    <div className="relative w-full pt-[max(2rem,env(safe-area-inset-top))] pb-16 min-h-[60vh] flex flex-col justify-center">
      {/* Background Images Layer */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        {validMovies.map((movie, idx) => {
          const bgUrl = tmdbImage(movie.backdropPath ?? null, "original");
          if (!bgUrl) return null;

          return (
            <div
              key={movie.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-1000 ease-in-out",
                idx === currentIndex ? "opacity-100" : "opacity-0"
              )}
            >
              <Image
                src={bgUrl}
                alt={movie.title}
                fill
                priority={idx === 0}
                className="object-cover object-top"
                unoptimized // TMDB URLs
              />
            </div>
          );
        })}

        {/* Cinematic Gradient Overlays */}
        {/* Top gradient to blend with the header */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
        
        {/* Bottom gradient to blend into the content below */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Foreground Content */}
      <div className="relative z-10 w-full px-4">
        {children}
      </div>
    </div>
  );
}
