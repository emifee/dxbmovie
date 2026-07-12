"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { X, Heart, ThumbsDown, Loader2, Sparkles } from "lucide-react";
import { tmdbImage } from "@/lib/utils";

interface MatchmakerModalProps {
  username: string;
  hostName: string;
  onClose: () => void;
}

interface SwipeMovie {
  id: number;
  title: string;
  posterPath: string;
  year: string;
}

// Curated diverse list of iconic films to swipe on
const SWIPE_MOVIES: SwipeMovie[] = [
  { id: 27205, title: "Inception", posterPath: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", year: "2010" },
  { id: 155, title: "The Dark Knight", posterPath: "/qJ2tW6WMUDux911BTUgMe1F6zCp.jpg", year: "2008" },
  { id: 11, title: "Star Wars", posterPath: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg", year: "1977" },
  { id: 680, title: "Pulp Fiction", posterPath: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
  { id: 597, title: "Titanic", posterPath: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg", year: "1997" },
  { id: 299536, title: "Avengers: Infinity War", posterPath: "/7WsyChQLEftFiDhRkZp4Npz2JCY.jpg", year: "2018" },
  { id: 278, title: "The Shawshank Redemption", posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg", year: "1994" },
  { id: 120, title: "The Lord of the Rings", posterPath: "/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg", year: "2001" },
  { id: 550, title: "Fight Club", posterPath: "/pB8BM7pdSp6B6Ih7QI4DrM7nk28.jpg", year: "1999" },
  { id: 872585, title: "Oppenheimer", posterPath: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", year: "2023" },
];

type MatchResult = { score: number; description: string; hostName: string };

export function MatchmakerModal({ username, hostName, onClose }: MatchmakerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipes, setSwipes] = useState<{ title: string; liked: boolean }[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [swipeAnim, setSwipeAnim] = useState<"left" | "right" | null>(null);

  const currentMovie = SWIPE_MOVIES[currentIndex];
  const progress = Math.round((currentIndex / SWIPE_MOVIES.length) * 100);

  const submitMatch = useCallback(
    async (finalSwipes: { title: string; liked: boolean }[]) => {
      setLoading(true);
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, swipes: finalSwipes }),
        });
        if (res.ok) {
          const data = await res.json();
          setResult(data);
        }
      } catch (e) {
        console.error("Match error:", e);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  function handleSwipe(liked: boolean) {
    setSwipeAnim(liked ? "right" : "left");

    setTimeout(() => {
      const newSwipes = [...swipes, { title: currentMovie.title, liked }];
      setSwipes(newSwipes);
      setSwipeAnim(null);

      if (currentIndex + 1 >= SWIPE_MOVIES.length) {
        submitMatch(newSwipes);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    }, 300);
  }

  // ─── Result Screen ───
  if (result) {
    const color =
      result.score >= 80 ? "from-green-400 to-emerald-500" :
      result.score >= 50 ? "from-amber-400 to-orange-500" :
      "from-red-400 to-rose-500";

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 pointer-events-auto">
        <div className="relative w-full max-w-sm rounded-3xl bg-[#0d0d12] border border-white/10 p-8 text-center overflow-hidden">
          {/* Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-primary/30 blur-[80px] pointer-events-none" />

          <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white transition">
            <X size={20} />
          </button>

          <div className="relative z-10">
            <p className="text-sm text-white/50 uppercase tracking-widest mb-4">Your Movie Match</p>

            {/* Score Ring */}
            <div className="relative mx-auto mb-6 h-36 w-36">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="url(#matchGrad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${result.score * 2.64} 264`}
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="matchGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-black bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                  {result.score}%
                </span>
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Match</span>
              </div>
            </div>

            <p className="text-lg font-semibold text-white mb-2">{result.description}</p>
            <p className="text-sm text-white/40 mb-8">with {result.hostName}</p>

            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3 text-sm font-bold text-white shadow-glow transition hover:scale-105 active:scale-95"
            >
              <Sparkles size={16} />
              Create Your Own Movie DNA
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading Screen ───
  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 pointer-events-auto">
        <div className="w-full max-w-sm rounded-3xl bg-[#0d0d12] border border-white/10 p-8 text-center">
          <Loader2 size={48} className="mx-auto animate-spin text-primary mb-4" />
          <p className="text-lg font-semibold text-white">Calculating your match...</p>
          <p className="text-sm text-white/40 mt-2">Our AI is comparing your taste with {hostName}&apos;s</p>
        </div>
      </div>
    );
  }

  // ─── Swipe Screen ───
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 pointer-events-auto">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#0d0d12] border border-white/10 p-6 overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-primary/20 blur-[60px] pointer-events-none" />

        <button onClick={onClose} className="absolute right-4 top-4 z-20 text-white/40 hover:text-white transition">
          <X size={20} />
        </button>

        <div className="relative z-10">
          <p className="text-sm text-white/50 text-center mb-1">
            Movie {currentIndex + 1} of {SWIPE_MOVIES.length}
          </p>

          {/* Progress bar */}
          <div className="h-1 w-full rounded-full bg-white/10 mb-5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Movie Card */}
          <div
            className={`relative mx-auto aspect-[2/3] w-56 rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-300 ${
              swipeAnim === "right" ? "translate-x-32 rotate-12 opacity-0" :
              swipeAnim === "left" ? "-translate-x-32 -rotate-12 opacity-0" : ""
            }`}
          >
            <Image
              src={tmdbImage(currentMovie.posterPath) || ""}
              alt={currentMovie.title}
              fill
              className="object-cover"
            />
            {/* Title overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12">
              <p className="text-base font-bold text-white">{currentMovie.title}</p>
              <p className="text-xs text-white/50">{currentMovie.year}</p>
            </div>
          </div>

          {/* Swipe buttons */}
          <div className="flex items-center justify-center gap-8 mt-6">
            <button
              onClick={() => handleSwipe(false)}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-500/40 bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20 hover:scale-110 active:scale-95"
            >
              <ThumbsDown size={26} />
            </button>
            <button
              onClick={() => handleSwipe(true)}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 transition hover:bg-emerald-500/20 hover:scale-110 active:scale-95"
            >
              <Heart size={26} />
            </button>
          </div>

          <p className="text-center text-xs text-white/30 mt-4">Love it or skip it — let&apos;s see your taste!</p>
        </div>
      </div>
    </div>
  );
}
