"use client";

import { useEffect, useState, useRef } from "react";
import { X, ThumbsUp, ThumbsDown, Plus, Volume2, VolumeX, Check, Sparkles, Play, Pause } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useSession } from "next-auth/react";
import { setPendingAction } from "@/lib/pending-actions";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export function TrailerModal() {
  const trailer = useUIStore((s) => s.trailer);
  const close = useUIStore((s) => s.closeTrailer);

  const [reels, setReels] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [globalMuted, setGlobalMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status } = useSession();
  const openAuthGate = useUIStore((s) => s.openAuthGate);

  const [playerReady, setPlayerReady] = useState(false);
  // Use a ref so the player instance is always accessible without triggering re-renders
  const ytPlayerRef = useRef<any>(null);
  const [ytPlayerReady, setYtPlayerReady] = useState(false); // signals player exists
  const [showTapHint, setShowTapHint] = useState<"play" | "pause" | null>(null);
  const tapHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = useRef<number>(0);

  useEffect(() => {
    if (!trailer) return;
    document.body.style.overflow = "hidden";

    // Destroy any existing player so initPlayer runs fresh for this trailer
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch {}
      ytPlayerRef.current = null;
    }
    setYtPlayerReady(false);
    setPlayerReady(false);
    setActiveIndex(0);
    setPage(1);

    // Set the first reel immediately
    setReels([{ key: trailer.key, title: trailer.title, backdrop: null, movie: { id: trailer.movieId } }]);

    if (trailer.movieId) {
      const type = trailer.mediaType || "movie";
      const u = `/api/movies/reels?id=${trailer.movieId}&type=${type}&mainKey=${trailer.key}&mainTitle=${encodeURIComponent(trailer.title)}&page=1`;
      fetch(u)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d) && d.length > 0) setReels(d);
        })
        .catch(console.error);
    }

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    
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

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [trailer, close]);

  useEffect(() => {
    if (reels.length === 0) return;
    // Already have a live player — just load the new video
    if (ytPlayerRef.current) return;

    function initPlayer() {
      ytPlayerRef.current = new window.YT.Player('yt-player-modal-container', {
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
            e.target.mute();
            e.target.playVideo();
            setYtPlayerReady(true);
          },
          onStateChange: (e: any) => {
            if (e.data === 1) { setPlayerReady(true); } // PLAYING
          }
        }
      });
    }

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.getElementsByTagName('script')[0].parentNode?.insertBefore(tag, document.getElementsByTagName('script')[0]);
      window.onYouTubeIframeAPIReady = initPlayer;
    }
  }, [reels.length]);

  useEffect(() => {
    if (!ytPlayerReady || !reels[activeIndex]) return;
    setPlayerReady(false);
    ytPlayerRef.current.loadVideoById(reels[activeIndex].key);
    if (globalMuted) {
      ytPlayerRef.current.mute();
    } else {
      ytPlayerRef.current.unMute();
    }
  }, [activeIndex, ytPlayerReady]);

  useEffect(() => {
    const timer = setTimeout(() => setPlayerReady(true), 4000);
    return () => clearTimeout(timer);
  }, [reels[activeIndex]?.key]);

  useEffect(() => {
    if (activeIndex >= reels.length - 2 && !loadingMore && reels.length > 0) {
      setLoadingMore(true);
      const nextPage = page + 1;
      const type = trailer?.mediaType || "movie";
      const u = `/api/movies/reels?id=${trailer?.movieId}&type=${type}&page=${nextPage}`;
      fetch(u)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d) && d.length > 0) {
            setReels((prev) => {
              const newReels = d.filter(item => !prev.some(p => p.key === item.key));
              return [...prev, ...newReels];
            });
            setPage(nextPage);
          }
        })
        .finally(() => setLoadingMore(false));
    }
  }, [activeIndex, reels.length, loadingMore, page, trailer]);

  if (!trailer) return null;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollPosition = container.scrollTop;
    const windowHeight = window.innerHeight;
    const newIndex = Math.round(scrollPosition / windowHeight);
    
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < reels.length) {
      setActiveIndex(newIndex);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !globalMuted;
    setGlobalMuted(newMuted);
    if (ytPlayerRef.current) {
      if (newMuted) {
        ytPlayerRef.current.mute();
      } else {
        ytPlayerRef.current.unMute();
        ytPlayerRef.current.playVideo();
      }
    }
  };

  const handleReaction = async (movieId: number, type: 'like' | 'dislike') => {
    if (status === "unauthenticated") {
      setPendingAction({ type: "reaction", movieId, reaction: type });
      openAuthGate();
      return;
    }
    const current = reactions[movieId];
    const newReaction = current === type ? 'none' : type;
    setReactions(prev => ({ ...prev, [movieId]: newReaction }));
    try {
      await fetch("/api/user/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId, reaction: newReaction })
      });
    } catch {
      setReactions(prev => ({ ...prev, [movieId]: current || 'none' }));
    }
  };

  const handleWatchlist = async (movie: any) => {
    if (status === "unauthenticated") {
      setPendingAction({ type: "add_watchlist", movie });
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

  const activeReel = reels[activeIndex];

  function flashTapHint(type: "play" | "pause") {
    setShowTapHint(type);
    if (tapHintTimer.current) clearTimeout(tapHintTimer.current);
    tapHintTimer.current = setTimeout(() => setShowTapHint(null), 600);
  }

  function handleTap(e: React.MouseEvent | React.TouchEvent) {
    // Ignore if touch moved significantly (scroll gesture)
    if ("changedTouches" in e) {
      const dy = Math.abs((e as React.TouchEvent).changedTouches[0].clientY - touchStartY.current);
      if (dy > 10) return;
    }
    if (!ytPlayerRef.current) return;
    const state = ytPlayerRef.current.getPlayerState();
    if (state !== 1) {
      // Not playing — start it
      ytPlayerRef.current.playVideo();
      flashTapHint("play");
    } else {
      // Already playing — toggle mute (same as Reels)
      const newMuted = !globalMuted;
      setGlobalMuted(newMuted);
      if (newMuted) ytPlayerRef.current.mute();
      else { ytPlayerRef.current.unMute(); ytPlayerRef.current.playVideo(); }
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black animate-fade-in">
      {/* SINGLE FIXED BACKGROUND PLAYER */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-black pointer-events-none">
        <div id="yt-player-modal-container" className="w-full h-full border-0 pointer-events-none" />
        
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

      {/* Mobile Top Bar (Title & Close Button) */}
      <div className="absolute top-0 inset-x-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-4 pt-[max(3rem,env(safe-area-inset-top))]">
        <p className="font-semibold text-white drop-shadow-md">Related Trailers</p>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleMute}
            className="grid h-10 w-10 place-items-center bg-black/40 hover:bg-primary/80 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 active:scale-95 border border-white/10"
          >
            {globalMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          
          <button
            onClick={close}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-white/20 border border-white/10"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="no-scrollbar absolute inset-0 z-20 overflow-y-auto snap-y snap-mandatory scroll-smooth"
        onScroll={handleScroll}
      >
        {reels.map((reel, idx) => {
          const isActive = idx === activeIndex;
          const isAdded = reel.movie?.id ? watchlistIds.has(reel.movie.id) : false;

          return (
            <div 
              key={`${reel.key}-${idx}`} 
              className="h-[100dvh] w-full shrink-0 snap-center relative"
              onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
              onTouchEnd={isActive ? handleTap : undefined}
              onClick={isActive ? handleTap : undefined}
            >
              {/* Tap flash indicator */}
              {isActive && showTapHint && (
                <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                  <div className="flex h-16 w-16 animate-ping-once items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                    {showTapHint === "play" ? <Play className="h-7 w-7 fill-white" /> : <Pause className="h-7 w-7 fill-white" />}
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pb-12 pt-32 lg:px-8 pointer-events-auto">
                
                <div className="flex flex-col gap-2 max-w-[70%]">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg lg:text-3xl">
                    {reel.title}
                  </h2>
                  <p className="text-sm text-white/80 drop-shadow-md">Trailer</p>
                  
                  {reel.movie?.overview && (
                    <p className="mt-2 text-sm text-white/90 line-clamp-2 drop-shadow-md">
                      {reel.movie.overview}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-6 pb-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); if(reel.movie?.id) handleReaction(reel.movie.id, 'like'); }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${reel.movie?.id && reactions[reel.movie.id] === 'like' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                      <ThumbsUp className={`h-6 w-6 ${reel.movie?.id && reactions[reel.movie.id] === 'like' ? 'fill-primary' : ''}`} />
                    </div>
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); if(reel.movie?.id) handleReaction(reel.movie.id, 'dislike'); }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${reel.movie?.id && reactions[reel.movie.id] === 'dislike' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                      <ThumbsDown className={`h-6 w-6 ${reel.movie?.id && reactions[reel.movie.id] === 'dislike' ? 'fill-primary' : ''}`} />
                    </div>
                  </button>

                  <button 
                    onClick={(e) => { e.stopPropagation(); if(reel.movie) handleWatchlist(reel.movie); }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="group flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md border ${isAdded ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]' : 'bg-black/40 border-white/20 text-white group-hover:bg-black/60'}`}>
                      {isAdded ? (
                        <Check className="h-6 w-6" />
                      ) : (
                        <Plus className="h-6 w-6" />
                      )}
                    </div>
                  </button>

                  <button 
                    onClick={(e) => { e.stopPropagation(); reel.movie && useUIStore.getState().openChat(reel.movie); }}
                    onTouchEnd={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
}
