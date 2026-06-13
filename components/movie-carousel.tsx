"use client";

import { MoviePosterCard } from "./movie-poster-card";
import type { Movie } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MovieCarousel({
  title,
  movies,
  size = "medium",
  action,
}: {
  title: string;
  movies: Movie[];
  size?: "large" | "medium";
  action?: React.ReactNode;
}) {
  if (!movies || movies.length === 0) return null;

  return (
    <section className="mb-1 w-full">
      <div className="mb-4 flex items-center justify-between px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight text-white lg:text-2xl">
          {title}
        </h2>
        {action && <div>{action}</div>}
      </div>

      <div className="relative w-full">
        <div
          className={cn(
            "flex w-full gap-4 overflow-x-auto pb-4 pl-0 pr-12 pt-2 sm:pl-0",
            "snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {movies.map((movie) => (
            <div
              key={movie.id}
              className={cn(
                "shrink-0 snap-start",
                size === "large" ? "w-[160px] sm:w-[200px]" : "w-[130px] sm:w-[150px]"
              )}
            >
              <MoviePosterCard movie={movie} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
