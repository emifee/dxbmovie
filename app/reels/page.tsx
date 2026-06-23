"use client";

import { useEffect, useState, useRef } from "react";
import { ThumbsUp, ThumbsDown, Plus, Volume2, VolumeX, Check, Sparkles, Film, Share2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { GoogleGate } from "@/components/auth/google-gate";
import { signIn, useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { setPendingAction } from "@/lib/pending-actions";
import { PROVIDER_THEMES } from "@/lib/constants";
import { recordReelWatched, isReelUnwatched } from "@/lib/reels-history";
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
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [globalMuted, setGlobalMuted] = useState(true);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Robust PWA detection
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone || 
      document.referrer.includes('android-app://');
    
    if (isStandalone) {
      setIsPWA(true);
    }
  }, []);
  
  // State for the single background player
  const [playerReady, setPlayerReady] = useState(false);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status } = useSession();
  const openAuthGate = useUIStore((s) => s.openAuthGate);

  // Initialize Official YouTube Iframe API
  useEffect(() => {
    if (reels.length === 0) return;
    
    // If API is already loaded but player isn't initialized
    if (window.YT && window.YT.Player && !ytPlayer) {
      initPlayer();
      return;
    }

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    function initPlayer() {
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
            e.target.mute();
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            if (e.data === 1) { // 1 = PLAYING
              setPlayerReady(true);
            }
          }
        }
      });
    }
  }, [reels.length]);

  // When activeReel changes, switch video using loadVideoById
  useEffect(() => {
    if (ytPlayer && reels[activeIndex]) {
      setPlayerReady(false); // Show thumbnail instantly
      ytPlayer.loadVideoById(reels[activeIndex].key); // Seamlessly switch video
      if (globalMuted) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
      }
      recordReelWatched(reels[activeIndex].key);
    }
  }, [activeIndex, ytPlayer]);

  // Failsafe: if something catastrophically breaks, hide thumbnail after 4s anyway
  useEffect(() => {
    const timer = setTimeout(() => setPlayerReady(true), 4000);
    return () => clearTimeout(timer);
  }, [reels[activeIndex]?.key]);

  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", PROVIDER_THEMES.all.hex);
    document.documentElement.style.setProperty("--color-primary-rgb", PROVIDER_THEMES.all.rgb);
    
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("id");
    const sharedType = params.get("type");
    
    // If a shared reel is requested, we must start at page 1 for the API to fetch it
    const randomStartPage = sharedId ? 1 : Math.floor(Math.random() * 10) + 1;
    
    const fetchInitialReels = async (pageNum: number) => {
      try {
        let url = `/api/movies/reels?page=${pageNum}`;
        if (sharedId && pageNum === 1) {
          url += `&id=${sharedId}`;
          if (sharedType) url += `&type=${sharedType}`;
        }
        
        const r = await fetch(url);
        const d = await r.json();
        if (Array.isArray(d) && d.length > 0) {
          const unseen = d.filter(item => isReelUnwatched(item.key));
          // If we found enough unseen, or we've tried 5 times, stop looping
          if (unseen.length >= 3 || pageNum > randomStartPage + 5) {
            setReels(unseen.length > 0 ? unseen : d);
            setPage(pageNum);
          } else {
            fetchInitialReels(pageNum + 1);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchInitialReels(randomStartPage);

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
  }, []);

  useEffect(() => {
    if (activeIndex >= reels.length - 2 && !loadingMore && reels.length > 0) {
      setLoadingMore(true);
      
      const fetchMoreReels = async (pageNum: number) => {
        try {
          const r = await fetch(`/api/movies/reels?page=${pageNum}`);
          const d = await r.json();
          if (Array.isArray(d)) {
            const unseen = d.filter(item => isReelUnwatched(item.key));
            if (unseen.length > 0 || pageNum > page + 5) {
              setReels((prev) => {
                const existing = new Set(prev.map(r => r.key));
                const newItems = (unseen.length > 0 ? unseen : d).filter(item => !existing.has(item.key));
                return [...prev, ...newItems];
              });
              setPage(pageNum);
              setLoadingMore(false);
            } else {
              fetchMoreReels(pageNum + 1);
            }
          } else {
             setLoadingMore(false);
          }
        } catch (e) {
          console.error(e);
          setLoadingMore(false);
        }
      };
      
      fetchMoreReels(page + 1);
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
        // Force play just in case iOS paused it
        ytPlayer.playVideo();
      }
    }
  };

  const activeReel = reels[activeIndex];

  return (
    <div className="flex min-h-screen bg-black overflow-hidden relative">
      <SideNav />

      {/* SINGLE FIXED BACKGROUND PLAYER */}
      {/* Uses the official YT.Player API to perfectly bypass iOS autoplay restrictions and hide black frames */}
      <div className="fixed inset-0 z-0 flex items-center justify-center bg-black lg:pl-20 xl:pl-64 pointer-events-none">
        
        {/* The target div that YT.Player will replace with an iframe */}
        <div id="yt-player-container" className="w-full h-full border-0 pointer-events-none" />
        
        {/* Loading overlay perfectly masks the YouTube buffering state */}
        {!playerReady && activeReel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
            <img 
              src={`https://i.ytimg.com/vi/${activeReel.key}/maxresdefault.jpg`}
              alt="Loading"
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              onError={(e) => {
                e.currentTarget.src = `https://i.ytimg.com/vi/${activeReel.key}/hqdefault.jpg`;
              }}
            />
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-primary relative z-20" />
          </div>
        )}
      </div>

      {/* Top Bar for Safe Area & Mute Button */}
      <div className="absolute top-0 inset-x-0 z-50 flex items-center justify-end bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-4 pt-[max(3rem,env(safe-area-inset-top))] pointer-events-none lg:pl-24 xl:pl-68">
        <button 
          onClick={toggleMute}
          className="grid h-10 w-10 place-items-center bg-black/40 hover:bg-primary/80 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 active:scale-95 border border-white/10 pointer-events-auto"
        >
          {globalMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      <main className="flex-1 lg:pl-20 xl:pl-64 z-10">
        {/* Full-screen vertical snapping container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto no-scrollbar scroll-smooth"
        >
          {reels.length === 0 ? null : (
            <>
              {reels.map((reel, idx) => {
                const isActive = idx === activeIndex;
                const reaction = reel.movie ? reactions[reel.movie.id] : 'none';
                const isWatchlisted = reel.movie ? watchlistIds.has(reel.movie.id) : false;

                return (
                  <div
                    key={`${reel.key}-${idx}`}
                    className="reel-snap-point relative w-full h-[100dvh] shrink-0 snap-center flex flex-col justify-end"
                  >
                    {/* Gate overlay for unauthenticated users after 3 swipes */}
                    {status === "unauthenticated" && idx >= 3 && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl">
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
                            onClick={(e) => { e.stopPropagation(); signIn("google", { callbackUrl: window.location.href }); }}
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
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

                    {/* Reel Overlay Content */}
                    <div 
                      className={cn(
                        "relative z-20 flex items-end justify-between p-4 lg:p-12 lg:pb-12 h-full",
                        isPWA ? "pb-[150px]" : "pb-[80px]"
                      )}
                      onClick={() => {
                        if (ytPlayer) {
                          if (ytPlayer.getPlayerState() !== 1) {
                            ytPlayer.playVideo();
                          } else {
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
                        <h2 className="text-2xl lg:text-4xl font-bold text-white shadow-sm leading-tight">
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
                            const url = `https://dxbmovies.online/reels?id=${reel.movie.id}&type=${reel.movie.mediaType || 'movie'}`;
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
