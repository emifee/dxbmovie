"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ThumbsUp, ThumbsDown, Plus, Volume2, VolumeX, Check, Sparkles, Film, Share2, Search, X, Loader2, Play } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { GoogleGate } from "@/components/auth/google-gate";
import { signIn, useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { setPendingAction } from "@/lib/pending-actions";
import { PROVIDER_THEMES } from "@/lib/constants";
import { recordReelWatched, isReelUnwatched } from "@/lib/reels-history";
import { trackReelWatch } from "@/lib/anon-prefs";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

interface Reel {
  key: string;
  title: string;
  backdrop: string | null;
  movie?: any;
}

export default function ReelsPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [globalMuted, setGlobalMuted] = useState(true);
  const [isPWA, setIsPWA] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchFeed, setIsSearchFeed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Robust PWA detection
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone || 
      document.referrer.includes('android-app://');
    
    if (isStandalone) {
      setIsPWA(true);
    }

    // Detect in-app browsers (Instagram, Facebook, TikTok, etc.)
    const ua = navigator.userAgent || '';
    const inApp = /instagram|fbav|fban|line\/|snapchat|tiktok|twitter|threads/i.test(ua);
    if (inApp) {
      setIsInAppBrowser(true);
    }
  }, []);
  
  // State for the single background player
  const [playerReady, setPlayerReady] = useState(false);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const ytPlayerRef = useRef<any>(null); // stable ref to avoid stale closures
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status } = useSession();
  const openAuthGate = useUIStore((s) => s.openAuthGate);

  // Keep ytPlayerRef in sync
  useEffect(() => {
    ytPlayerRef.current = ytPlayer;
  }, [ytPlayer]);

  // Pre-load the YouTube IFrame API immediately (don't wait for reels data)
  useEffect(() => {
    if (window.YT && window.YT.Player) return; // already loaded
    
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  }, []);

  // Initialize player once we have both the YT API and at least 1 reel
  useEffect(() => {
    if (reels.length === 0 || ytPlayer) return;
    
    function tryInit() {
      if (!window.YT || !window.YT.Player) return;
      
      const player = new window.YT.Player('yt-player-container', {
        height: '100%',
        width: '100%',
        videoId: reels[0]?.key,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          mute: 1,
        },
        events: {
          onReady: (e: any) => {
            setYtPlayer(e.target);
            ytPlayerRef.current = e.target;
            e.target.mute();
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            if (e.data === 1) { // 1 = PLAYING
              setPlayerReady(true);
              setAutoplayBlocked(false);
            }
          },
          onError: (e: any) => {
            // Video removed, private, or geo-restricted — skip it
            setReels((prev) => {
              const filtered = prev.filter((_, i) => i !== activeIndex);
              return filtered;
            });
          }
        }
      });
    }

    // If YT API is already loaded, init immediately
    if (window.YT && window.YT.Player) {
      tryInit();
    } else {
      // Otherwise wait for the API ready callback
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        tryInit();
      };
    }
  }, [reels.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeReel changes, switch video using loadVideoById
  useEffect(() => {
    if (ytPlayer && reels[activeIndex]) {
      setPlayerReady(false); // Show thumbnail instantly
      setAutoplayBlocked(false);
      ytPlayer.loadVideoById(reels[activeIndex].key); // Seamlessly switch video
      if (globalMuted) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
      }
      recordReelWatched(reels[activeIndex].key);
      if (reels[activeIndex].movie?.id) {
        trackReelWatch(reels[activeIndex].movie.id);
      }

      // Track genre preferences on the server
      const movie = reels[activeIndex]?.movie;
      if (movie?.genreIds && movie.genreIds.length > 0 && status === "authenticated") {
        fetch("/api/user/track-reel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ genreIds: movie.genreIds }),
        }).catch(() => {});
      }
    }
  }, [activeIndex, ytPlayer, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Failsafe: detect if autoplay is blocked by iOS Safari
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!playerReady && ytPlayerRef.current) {
        const state = ytPlayerRef.current.getPlayerState();
        if (state !== 1 && state !== 3) {
          setAutoplayBlocked(true);
        }
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [reels[activeIndex]?.key, playerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch initial reels (NO recursive loop — single fast call) ──
  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", PROVIDER_THEMES.all.hex);
    document.documentElement.style.setProperty("--color-primary-rgb", PROVIDER_THEMES.all.rgb);
    
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("id");
    const sharedType = params.get("type");
    
    const randomStartPage = sharedId ? 1 : Math.floor(Math.random() * 5) + 1;
    
    const fetchReels = async () => {
      try {
        let url = `/api/movies/reels?page=${randomStartPage}`;
        if (sharedId) {
          url += `&id=${sharedId}`;
          if (sharedType) url += `&type=${sharedType}`;
        }
        const r = await fetch(url);
        const d = await r.json();
        if (Array.isArray(d) && d.length > 0) {
          // Get local anon dislikes
          const anonPrefs = await import("@/lib/anon-prefs").then(m => m.getAnonPrefs());
          const notInterested = new Set(anonPrefs.notInterested || []);

          // Prefer unseen reels, and filter out strictly disliked movies
          const unseen = d.filter((item, index) => {
            if (sharedId && index === 0) return true;
            if (item.movie?.id && notInterested.has(item.movie.id)) return false;
            return isReelUnwatched(item.key);
          });
          
          setReels(unseen.length > 0 ? unseen : d.filter((item: any) => !(item.movie?.id && notInterested.has(item.movie.id))));
          setPage(randomStartPage);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchReels();

    // Fetch user data in parallel (non-blocking)
    fetch("/api/user/reactions")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          const m: Record<number, string> = {};
          d.forEach(x => m[x.movieId] = x.reaction);
          setReactions(m);
        }
      }).catch(() => {});
    
    fetch("/api/user/watchlist")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setWatchlistIds(new Set(d.map(m => m.id)));
        }
      }).catch(() => {});

    // Listen to drawer action to instantly remove disliked reel
    const handleNotInterested = (e: any) => {
      const id = e.detail?.movieId;
      if (id) {
        setReels(prev => {
          const next = prev.filter(r => r.movie?.id !== id);
          if (next.length === 0) return prev; // Don't allow empty feed
          return next;
        });
      }
    };
    window.addEventListener("dxb-not-interested", handleNotInterested);
    return () => window.removeEventListener("dxb-not-interested", handleNotInterested);
  }, []);

  // ── Load more reels when user is near the end ──
  useEffect(() => {
    if (activeIndex >= reels.length - 3 && !loadingMore && reels.length > 0) {
      setLoadingMore(true);
      
      const nextPage = page + 1;
      fetch(`/api/movies/reels?page=${nextPage}`)
        .then(r => r.json())
        .then(async d => {
          if (Array.isArray(d)) {
            const anonPrefs = await import("@/lib/anon-prefs").then(m => m.getAnonPrefs());
            const notInterested = new Set(anonPrefs.notInterested || []);

            const valid = d.filter(item => {
              // Also filter out disliked from the server state if present
              if (item.movie?.id && (notInterested.has(item.movie.id) || reactions[item.movie.id] === 'dislike')) return false;
              return true;
            });

            const unseen = valid.filter(item => isReelUnwatched(item.key));
            setReels((prev) => {
              const existing = new Set(prev.map(r => r.key));
              const newItems = (unseen.length > 0 ? unseen : valid).filter(item => !existing.has(item.key));
              return [...prev, ...newItems];
            });
            setPage(nextPage);
          }
        })
        .catch(e => console.error(e))
        .finally(() => setLoadingMore(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, reels.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const items = container.querySelectorAll(".reel-snap-point");
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestIdx = activeIndex;
    let minDiff = Infinity;

    items.forEach((item, i) => {
      const rect = item.getBoundingClientRect();
      const childCenter = rect.top + rect.height / 2;
      const diff = Math.abs(containerCenter - childCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }
  };

  const handleReaction = async (movie: any, newReaction: 'like' | 'dislike') => {
    if (status === "unauthenticated") {
      if (movie && movie.id) {
        setPendingAction({ type: "reaction", movieId: movie.id, reaction: newReaction });
      }
      openAuthGate();
      return;
    }
    if (!movie || !movie.id) return;
    const movieId = movie.id;
    const current = reactions[movieId];
    const finalReaction = current === newReaction ? 'none' : newReaction;
    
    setReactions(prev => ({ ...prev, [movieId]: finalReaction }));
    try {
      await fetch("/api/user/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId, reaction: finalReaction })
      });
    } catch {
      setReactions(prev => ({ ...prev, [movieId]: current || 'none' }));
    }
  };

  const handleWatchlist = async (movie: any) => {
    if (status === "unauthenticated") {
      if (movie && movie.id) {
        setPendingAction({ type: "add_watchlist", movie });
      }
      openAuthGate();
      return;
    }
    if (!movie || !movie.id) return;
    const movieId = movie.id;
    const isAdded = watchlistIds.has(movieId);
    
    setWatchlistIds(prev => {
      const next = new Set(prev);
      if (isAdded) next.delete(movieId);
      else next.add(movieId);
      return next;
    });

    try {
      if (isAdded) {
        await fetch("/api/user/watchlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId })
        });
      } else {
        await fetch("/api/user/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movie })
        });
      }
    } catch {
      setWatchlistIds(prev => {
        const next = new Set(prev);
        if (isAdded) next.add(movieId);
        else next.delete(movieId);
        return next;
      });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !globalMuted;
    setGlobalMuted(newMuted);
    
    if (ytPlayer) {
      if (newMuted) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
        ytPlayer.playVideo();
      }
    }
  };

  const activeReel = reels[activeIndex];

  // ── Search handler ──
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/movies/reels/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) {
        setReels(d);
        setActiveIndex(0);
        setIsSearchFeed(true);
        setSearchOpen(false);
        setSearchQuery("");
        if (ytPlayerRef.current && d[0]?.key) {
          setPlayerReady(false);
          ytPlayerRef.current.loadVideoById(d[0].key);
          if (globalMuted) ytPlayerRef.current.mute();
          else ytPlayerRef.current.unMute();
        }
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, globalMuted]);

  const clearSearchFeed = useCallback(() => {
    setIsSearchFeed(false);
    setReels([]);
    setActiveIndex(0);
    setPage(1);
    setInitialLoading(true);
    const randomStartPage = Math.floor(Math.random() * 5) + 1;
    fetch(`/api/movies/reels?page=${randomStartPage}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setReels(d);
          setPage(randomStartPage);
        }
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen bg-black overflow-hidden relative">
      <SideNav />

      {/* ── LOADING STATE: Show while fetching first batch of reels ── */}
      {initialLoading && reels.length === 0 && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-5 animate-in fade-in duration-300">
            <div className="relative">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 shadow-glow">
                <Film className="h-9 w-9 text-primary animate-pulse" />
              </div>
              <Loader2 className="absolute -inset-2 h-24 w-24 text-primary/40 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">Loading Trailers</p>
              <p className="text-sm text-white/40 mt-1">Finding the best clips for you…</p>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE FIXED BACKGROUND PLAYER */}
      <div className="fixed inset-0 z-0 flex items-center justify-center bg-black lg:pl-20 xl:pl-64 pointer-events-none">
        
        {/* The target div that YT.Player will replace with an iframe */}
        <div id="yt-player-container" className="w-full h-full border-0 pointer-events-none" />
        
        {/* Loading overlay masks the YouTube buffering state or shows a play button if blocked */}
        {!playerReady && activeReel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
            <img 
              src={activeReel.backdrop || `https://i.ytimg.com/vi/${activeReel.key}/maxresdefault.jpg`}
              alt="Loading"
              className="absolute inset-0 w-full h-full object-cover blur-sm scale-105 brightness-50"
              onError={(e) => {
                e.currentTarget.src = `https://i.ytimg.com/vi/${activeReel.key}/hqdefault.jpg`;
              }}
            />
            {autoplayBlocked ? (
              <div className="flex flex-col items-center gap-3 relative z-20 animate-in zoom-in duration-300">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/80 backdrop-blur-md shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.6)] border border-white/20">
                  <Play className="h-8 w-8 text-white ml-1 fill-white" />
                </div>
                <span className="text-white font-semibold tracking-wide drop-shadow-md">Tap to play</span>
              </div>
            ) : (
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-primary relative z-20" />
            )}
          </div>
        )}
      </div>

      {/* Top Bar for Safe Area & Mute Button */}
      <div className="absolute top-0 inset-x-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-4 pt-[max(3rem,env(safe-area-inset-top))] pointer-events-none lg:pl-24 xl:pl-68">
        {/* Left side: search label when in search feed */}
        <div className="pointer-events-auto">
          {isSearchFeed && (
            <button
              onClick={clearSearchFeed}
              className="flex items-center gap-2 bg-primary/20 border border-primary/40 backdrop-blur-md rounded-full px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/30"
            >
              ← Back to Feed
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          <button 
            onClick={toggleMute}
            className="grid h-10 w-10 place-items-center bg-black/40 hover:bg-primary/80 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 active:scale-95 border border-white/10"
          >
            {globalMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Search Overlay ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-xl" onClick={() => setSearchOpen(false)}>
          <div 
            className="relative w-full max-w-lg mx-4 mt-[max(5rem,env(safe-area-inset-top))] rounded-2xl bg-[#0d0d12]/95 border border-white/10 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSearchOpen(false)}
              className="absolute right-3 top-3 text-white/40 hover:text-white transition"
            >
              <X size={20} />
            </button>

            {/* Search header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-primary shadow-glow">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Search Trailers</h3>
                <p className="text-xs text-white/40">Find any movie or TV show trailer</p>
              </div>
            </div>

            {/* Search input */}
            <form onSubmit={handleSearch} className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Game of Thrones, Avengers, Inception..."
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 pl-11 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition"
                autoFocus
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <button
                type="submit"
                disabled={searchLoading || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-primary px-4 py-1.5 text-xs font-semibold text-white transition hover:shadow-glow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {searchLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : "Search"}
              </button>
            </form>

            {/* Quick suggestion chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { label: "Action", value: "Action" },
                { label: "Comedy", value: "Comedy" },
                { label: "Horror", value: "Horror" },
                { label: "Romance", value: "Romance" },
                { label: "Sci-Fi", value: "Science Fiction" },
                { label: "Thriller", value: "Thriller" },
              ].map(genre => (
                <button
                  key={genre.label}
                  onClick={() => { setSearchQuery(genre.value); }}
                  className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-primary/20 hover:border-primary/40 hover:text-primary"
                >
                  {genre.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 lg:pl-20 xl:pl-64 z-10">
        {/* Full-screen vertical snapping container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto no-scrollbar scroll-smooth"
        >
          {reels.length === 0 ? null : (
            <>
              {reels.slice(0, status === "unauthenticated" ? 6 : undefined).map((reel, idx) => {
                const isActive = idx === activeIndex;
                const reaction = reel.movie ? reactions[reel.movie.id] : 'none';
                const isWatchlisted = reel.movie ? watchlistIds.has(reel.movie.id) : false;

                return (
                  <div
                    key={`${reel.key}-${idx}`}
                    className="reel-snap-point relative w-full h-[100dvh] shrink-0 snap-center flex flex-col justify-end"
                  >
                    {/* Gate overlay for unauthenticated users after 5 swipes */}
                    {status === "unauthenticated" && idx >= 5 && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl">
                        <div className="flex flex-col items-center gap-4 px-8 text-center max-w-sm">
                          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-primary shadow-glow">
                            <Film className="h-8 w-8 text-white" />
                          </div>
                          <h2 className="text-2xl font-bold text-white">Keep watching Reels</h2>
                          <p className="text-sm text-white/60 leading-relaxed">
                            Sign in to unlock unlimited trailers, like your favorites, build your watchlist, and get AI-powered picks.
                          </p>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              localStorage.setItem("dxb_signup_source", "reels_limit");
                              signIn("google", { callbackUrl: window.location.href }); 
                            }}
                            className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-medium text-black transition hover:shadow-glow-lg active:scale-[0.98]"
                          >
                            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            Continue with Google
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="text-xs text-white/40 hover:text-white/60 transition"
                          >
                            ← Go back to top
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Gradient to make text readable */}
                    <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

                    {/* Reel Overlay Content */}
                    <div 
                      className={cn(
                        "relative z-20 flex items-end justify-between p-4 lg:p-12 h-full",
                        isPWA ? "!pb-[160px]" : isInAppBrowser ? "!pb-[140px]" : "!pb-[120px]"
                      )}
                      onClick={() => {
                        if (ytPlayer) {
                          if (ytPlayer.getPlayerState() !== 1) {
                            // User explicitly tapping to play a blocked video
                            // Start it WITH sound immediately!
                            setGlobalMuted(false);
                            ytPlayer.unMute();
                            ytPlayer.playVideo();
                          } else {
                            // Video is already playing, toggle mute
                            const newMuted = !globalMuted;
                            setGlobalMuted(newMuted);
                            if (newMuted) ytPlayer.mute();
                            else ytPlayer.unMute();
                          }
                        }
                      }}
                    >
                      
                      {/* Left: Info */}
                      <div className="flex flex-col items-start gap-2 max-w-[70%]">
                        <h2 className="text-2xl lg:text-4xl font-bold text-white drop-shadow-lg leading-tight">
                          {reel.title}
                        </h2>
                        {reel.movie?.overview && (
                          <p className="text-white/80 text-sm lg:text-base line-clamp-2 shadow-sm">
                            {reel.movie.overview}
                          </p>
                        )}
                        <span className="inline-block mt-2 rounded-md bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-semibold text-primary backdrop-blur-md shadow-glow">
                          Trailer
                        </span>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-col items-center gap-6 pb-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReaction(reel.movie, 'like'); }}
                          aria-label="Like trailer"
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${reaction === 'like' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                            <ThumbsUp className={`h-6 w-6 ${reaction === 'like' ? 'fill-primary' : ''}`} />
                          </div>
                        </button>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReaction(reel.movie, 'dislike'); }}
                          aria-label="Dislike trailer"
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${reaction === 'dislike' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                            <ThumbsDown className={`h-6 w-6 ${reaction === 'dislike' ? 'fill-primary' : ''}`} />
                          </div>
                        </button>

                        <button 
                          onClick={(e) => { e.stopPropagation(); handleWatchlist(reel.movie); }}
                          aria-label={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${isWatchlisted ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                            {isWatchlisted ? (
                              <Check className="h-6 w-6" />
                            ) : (
                              <Plus className="h-6 w-6" />
                            )}
                          </div>
                        </button>
                        
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (!reel.movie) return;
                            const url = `https://dxbmovie.online/r/${reel.movie.id}?type=${reel.movie.mediaType || 'movie'}`;
                            if (navigator.share) {
                              navigator.share({ title: `Watch ${reel.title} Trailer`, url }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(url);
                              alert("Link copied to clipboard!");
                            }
                          }}
                          aria-label="Share this trailer"
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border bg-black/40 border-white/20 text-white group-hover:bg-black/60">
                            <Share2 className="h-6 w-6" />
                          </div>
                        </button>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
                          aria-label="Search trailers"
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border bg-black/40 border-white/20 text-white group-hover:bg-black/60">
                            <Search className="h-6 w-6" />
                          </div>
                        </button>

                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (reel.movie) useUIStore.getState().openChat(reel.movie); 
                          }}
                          aria-label="Ask AI about this title"
                          className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border bg-black/40 border-white/20 text-white group-hover:bg-black/60">
                            <Sparkles className="h-6 w-6" />
                          </div>
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
              
              {loadingMore && (
                <div className="h-32 w-full flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav />
      <ChatDrawer />
      <GoogleGate />
    </div>
  );
}
