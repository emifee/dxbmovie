"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Calendar, MapPin } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Movie } from "@/lib/types";
import { MoviePosterCard } from "@/components/movie-poster-card";

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
          "fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          actorId ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex max-h-[90vh] flex-col rounded-t-[32px] bg-[#0A0A0A] shadow-2xl transition-transform duration-300 sm:inset-x-auto sm:right-6 sm:top-24 sm:w-[400px] sm:rounded-3xl sm:border sm:border-border",
          actorId ? "translate-y-0 sm:translate-y-0" : "translate-y-full sm:translate-y-8 sm:opacity-0 sm:pointer-events-none"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 pb-4">
          <h2 className="text-lg font-bold text-white">Profile</h2>
          <button
            onClick={closeActor}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : actor ? (
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-10">
            <div className="p-5">
              <div className="flex gap-4">
                <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-raised border border-white/10 shadow-lg">
                  {actor.profilePath ? (
                    <Image src={actor.profilePath} alt={actor.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/20">
                      {actor.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <h1 className="text-2xl font-bold text-white leading-tight">{actor.name}</h1>
                  <p className="mt-1 text-sm font-medium text-primary">{actor.knownForDepartment}</p>
                  
                  {(actor.birthday || actor.placeOfBirth) && (
                    <div className="mt-3 flex flex-col gap-1.5 text-xs text-text-secondary">
                      {actor.birthday && (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-white/40" />
                          <span>{new Date(actor.birthday).toLocaleDateString()}</span>
                        </div>
                      )}
                      {actor.placeOfBirth && (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-white/40 shrink-0" />
                          <span className="line-clamp-1">{actor.placeOfBirth}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {actor.biography && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">Biography</h3>
                  <div className="relative">
                    <p className={cn("text-sm leading-relaxed text-white/80", !bioExpanded && "line-clamp-4")}>
                      {actor.biography}
                    </p>
                    {actor.biography.length > 200 && (
                      <button 
                        onClick={() => setBioExpanded(!bioExpanded)}
                        className="mt-1 text-xs font-bold text-primary hover:underline"
                      >
                        {bioExpanded ? "Show Less" : "Read More"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {actor.movies?.length > 0 && (
              <div className="mt-2 border-t border-white/5 pt-6">
                <div className="px-5 mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Known For</h3>
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
