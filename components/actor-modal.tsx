"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Calendar, MapPin } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Movie } from "@/lib/types";
import { MoviePosterCard } from "@/components/movie-poster-card";
import { SectionLabel } from "@/components/ui/section-label";

interface ActorProfile {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  knownForDepartment: string;
  movies: Movie[];
}

export function ActorModal() {
  const actorId = useUIStore((s) => s.actorId);
  const closeActor = useUIStore((s) => s.closeActor);
  const [actor, setActor] = useState<ActorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    if (!actorId) {
      setActor(null);
      setBioExpanded(false);
      return;
    }

    setLoading(true);
    fetch(`/api/actor?id=${actorId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setActor(data);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [actorId]);

  return (
    <>
      <div
        onClick={closeActor}
        className={cn(
          "fixed inset-0 z-[80] bg-black/80 backdrop-blur-md transition-opacity duration-300",
          actorId ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[80] flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl bg-[#0A0A0A] shadow-2xl shadow-black/60 transition-transform duration-300 sm:inset-x-auto sm:right-6 sm:top-24 sm:w-[400px] sm:rounded-3xl sm:border sm:border-white/10",
          actorId ? "translate-y-0 sm:translate-y-0" : "translate-y-full sm:translate-y-8 sm:opacity-0 sm:pointer-events-none"
        )}
      >
        {/* Floating close — sits over the hero */}
        <div className="absolute right-4 top-4 z-20">
          <button
            onClick={closeActor}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : actor ? (
          <div className="no-scrollbar flex-1 overflow-y-auto scrollbar-hide pb-10">
            {/* Full-bleed portrait cover — name sits on the image over a gradient fade.
                Height is tuned to TMDB's 2:3 portraits: at sheet width the image scales
                to ~1.5x its width, so a taller hero renders more frame *below* the
                subject's face, keeping the name clear of it instead of on the chin. */}
            <div className="relative h-[440px] w-full overflow-hidden">
              {actor.profilePath ? (
                <Image
                  src={actor.profilePath}
                  alt={actor.name}
                  fill
                  unoptimized
                  priority
                  className="object-cover object-top"
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-primary opacity-25" />
                  <div className="absolute inset-0 grid place-items-center text-7xl font-bold text-white/20">
                    {actor.name.charAt(0)}
                  </div>
                </>
              )}

              {/* Scrim: solid at the base so the name always reads, but confined to the
                  lower 45% and fading late, so it lands on shoulders — not the face. */}
              <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent" />

              <span className="pointer-events-none absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50 sm:hidden" />

              <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
                <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight text-white drop-shadow-lg">
                  {actor.name}
                </h1>
                {actor.knownForDepartment && (
                  <p className="mt-1.5 text-[14px] leading-snug text-white/65">
                    Known for {actor.knownForDepartment.toLowerCase()}
                    {actor.movies?.length > 0 && ` · ${actor.movies.length} titles`}
                  </p>
                )}
              </div>
            </div>

            <div className="relative px-5 pt-5">
              {(actor.birthday || actor.placeOfBirth) && (
                <div className="flex flex-wrap gap-2">
                  {actor.birthday && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] text-white/70">
                      <Calendar size={12} className="text-white/40" />
                      <span>
                        {new Date(actor.birthday).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {actor.placeOfBirth && (
                    <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] text-white/70">
                      <MapPin size={12} className="shrink-0 text-white/40" />
                      <span className="line-clamp-1">{actor.placeOfBirth}</span>
                    </div>
                  )}
                </div>
              )}

              {actor.biography && (
                <div className="mt-7">
                  <SectionLabel>Biography</SectionLabel>
                  <div className="relative mt-3">
                    <p className={cn("text-[13.5px] leading-relaxed text-white/70", !bioExpanded && "line-clamp-4")}>
                      {actor.biography}
                    </p>
                    {actor.biography.length > 200 && (
                      <button
                        onClick={() => setBioExpanded(!bioExpanded)}
                        className="mt-2 text-[11px] font-bold uppercase tracking-wide text-primary transition hover:opacity-80"
                      >
                        {bioExpanded ? "Show Less" : "Read More"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {actor.movies?.length > 0 && (
              <div className="mt-8 border-t border-white/[0.07] pt-6">
                <div className="mb-4 px-5">
                  <SectionLabel>Known For</SectionLabel>
                </div>
                <div className="flex gap-4 overflow-x-auto px-5 pb-4 scrollbar-hide no-scrollbar">
                  {actor.movies.map((m) => (
                    <div key={m.id} className="w-[120px] shrink-0">
                      <MoviePosterCard movie={m} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-text-secondary">
            Actor not found
          </div>
        )}
      </div>
    </>
  );
}
