"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { trackReelWatch, trackNotInterested } from "@/lib/anon-prefs";
import { tmdbImage } from "@/lib/utils";

interface WatchClick {
  movieId: number;
  title: string;
  posterUrl: string | null;
  provider: string;
  clickedAt: number;
}

const ONE_HOUR = 60 * 60 * 1000;
const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

export function DelayedReturnPrompt() {
  const [click, setClick] = useState<WatchClick | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status } = useSession();

  const checkEligibility = () => {
    try {
      const stored = localStorage.getItem("dxb_last_watch_click");
      if (!stored) {
        setClick(null);
        return;
      }

      const data = JSON.parse(stored) as WatchClick;
      const elapsed = Date.now() - data.clickedAt;

      if (elapsed > SEVENTY_TWO_HOURS) {
        // Expired, clean up silently
        clearState();
      } else if (elapsed >= ONE_HOUR) {
        setClick(data);
      }
    } catch (e) {
      console.error("Failed to parse watch click", e);
    }
  };

  useEffect(() => {
    checkEligibility();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkEligibility();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const clearState = () => {
    localStorage.removeItem("dxb_last_watch_click");
    setClick(null);
    if (status === "authenticated") {
      fetch("/api/user/watch-click", { method: "DELETE" }).catch(() => {});
    }
  };

  const handleResponse = async (reaction: "like" | "none" | "dislike") => {
    if (!click || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (status === "authenticated") {
        await fetch("/api/user/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId: click.movieId, reaction }),
        });
      } else {
        // Anonymous sync
        if (reaction === "like") {
          trackReelWatch(click.movieId);
        } else if (reaction === "dislike") {
          trackNotInterested(click.movieId);
        }
      }
    } catch (e) {
      console.error("Failed to track watch reaction", e);
    } finally {
      clearState();
      setIsSubmitting(false);
    }
  };

  if (!click) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm animate-slide-up sm:w-full">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1C1C1E]/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <button
          onClick={clearState}
          className="absolute right-2 top-2 rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        <div className="flex gap-3">
          {click.posterUrl ? (
            <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 shadow-sm">
              <Image src={tmdbImage(click.posterUrl, "w185")!} alt={click.title} fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-white/5 border border-white/10 shadow-sm text-xs text-white/30 text-center px-1">
              {click.title}
            </div>
          )}

          <div className="flex flex-1 flex-col justify-center">
            <p className="text-xs font-semibold text-primary/90">How was it?</p>
            <p className="line-clamp-2 text-sm font-medium leading-tight text-white mt-0.5">
              {click.title}
            </p>
            <p className="text-[11px] text-text-secondary mt-1">on {click.provider}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => handleResponse("like")}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 transition active:scale-95 hover:bg-white/10"
          >
            <span className="text-lg">🤩</span>
            <span className="text-[10px] font-medium text-white/80">Loved it</span>
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => handleResponse("none")}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 transition active:scale-95 hover:bg-white/10"
          >
            <span className="text-lg">🤷</span>
            <span className="text-[10px] font-medium text-white/80">It was okay</span>
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => handleResponse("dislike")}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 transition active:scale-95 hover:bg-white/10"
          >
            <span className="text-lg">👎</span>
            <span className="text-[10px] font-medium text-white/80">Not for me</span>
          </button>
        </div>
      </div>
    </div>
  );
}
