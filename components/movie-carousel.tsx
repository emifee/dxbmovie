"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoviePosterCard } from "./movie-poster-card";
import type { Movie } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Card + spacer widths per size. The spacer is half the viewport minus half a
 *  card, which is what lets the first and last item actually reach the centre. */
const SIZES = {
  large: {
    card: "w-[160px] sm:w-[200px]",
    spacer: "w-[calc(50%-80px)] sm:w-[calc(50%-100px)]",
  },
  medium: {
    card: "w-[130px] sm:w-[150px]",
    spacer: "w-[calc(50%-65px)] sm:w-[calc(50%-75px)]",
  },
} as const;

/**
 * Centre-focus carousel: the card nearest the viewport centre is rendered at
 * full scale and opacity, its neighbours recede. Snap points are centred, so
 * flicking always parks a card in focus.
 *
 * The active card is derived from scroll position (nearest centre) rather than
 * an IntersectionObserver — with several cards visible at once, "most visible"
 * is ambiguous, but "closest to centre" is exact.
 */
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
  // Explicitly nullable so `current` stays mutable — useRef<T>(null) yields a
  // read-only RefObject, which the ref callback below needs to assign.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const didCentre = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * Park the rail on the middle card on first mount.
   *
   * Opening on card 0 leaves the whole left half of the rail empty, because the
   * centring spacer has nothing before it to show. Starting mid-list means cards
   * flank the focused one on both sides and the rail reads as full.
   *
   * Done in a ref callback rather than an effect: this runs during commit,
   * before paint, so there's no frame where the rail sits at scrollLeft 0 and
   * visibly jumps.
   */
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    scrollerRef.current = node;
    if (!node || didCentre.current) return;

    const slides = node.querySelectorAll<HTMLElement>("[data-slide]");
    if (slides.length === 0) return;

    const middle = Math.floor((slides.length - 1) / 2);
    const slide = slides[middle];
    if (!slide) return;

    node.scrollLeft = slide.offsetLeft + slide.offsetWidth / 2 - node.clientWidth / 2;
    setActiveIndex(middle);
    didCentre.current = true;
  }, []);

  const updateActive = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const viewportCentre = el.scrollLeft + el.clientWidth / 2;

    let best = 0;
    let bestDistance = Infinity;
    // Only real slides carry data-slide — the edge spacers are skipped, so the
    // index stays aligned with `movies`.
    el.querySelectorAll<HTMLElement>("[data-slide]").forEach((slide, i) => {
      const slideCentre = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCentre - viewportCentre);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActiveIndex(best);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      // Coalesce scroll events to one measurement per frame; reading offsetLeft
      // on every event would thrash layout while flicking.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateActive();

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [updateActive, movies.length]);

  if (!movies || movies.length === 0) return null;

  const { card, spacer } = SIZES[size];

  return (
    <section className="w-full">
      <div className="mb-2 flex items-center justify-between px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight text-white lg:text-2xl">{title}</h2>
        {action && <div>{action}</div>}
      </div>

      <div
        ref={attachScroller}
        className={cn(
          // pb-2 leaves just enough room for the focused card's shadow.
          "flex w-full gap-4 overflow-x-auto pb-2 pt-1",
          "snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        <div className={cn("shrink-0", spacer)} aria-hidden />

        {movies.map((movie, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={movie.id}
              data-slide
              className={cn(
                "shrink-0 snap-center transition-all duration-300 ease-out motion-reduce:transition-none",
                card,
                isActive
                  ? "scale-100 opacity-100"
                  : "scale-[0.86] opacity-45 motion-reduce:scale-100 motion-reduce:opacity-100"
              )}
            >
              <MoviePosterCard movie={movie} />
            </div>
          );
        })}

        <div className={cn("shrink-0", spacer)} aria-hidden />
      </div>
    </section>
  );
}
