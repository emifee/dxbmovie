"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Search, X, SlidersHorizontal, Film } from "lucide-react";
import { useSession } from "next-auth/react";

import { FloatingChatOrb } from "@/components/chat/floating-chat-orb";
import { GenrePills } from "@/components/genre-pills";
import { CountryPills } from "@/components/country-pills";
import { MoviePosterCard } from "@/components/movie-poster-card";
import { HeroBackground } from "@/components/hero-background";
import { MovieCarousel } from "@/components/movie-carousel";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { MenuDrawer } from "@/components/menu-drawer";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { MovieDetailDrawer } from "@/components/movie-detail-drawer";
import { FilterDrawer } from "@/components/filter-drawer";
import { TrailerModal } from "@/components/trailer-modal";
import { GoogleGate } from "@/components/auth/google-gate";
import { EngagementNudge } from "@/components/engagement-nudge";
import { FeedbackModal, loadFeedbackState, markFeedbackPrompted } from "@/components/feedback-modal";
import { useAccountStore } from "@/lib/account-store";
import { useUIStore, useFilterStore } from "@/lib/store";
import { getSearchHistory, saveSearchQuery, clearSearchHistory } from "@/lib/search-history";
import { trackGenre, trackCountry, trackProvider, trackSearch, getTopGenre, getTopCountry } from "@/lib/anon-prefs";
import { cn } from "@/lib/utils";
import { MOCK_MOVIES } from "@/lib/mock-data";
import { STREAMING_SERVICES, PROVIDER_THEMES, GENRE_THEMES } from "@/lib/constants";
import type { Movie, UserList } from "@/lib/types";

const OnboardingOverlay = dynamic(
  () => import("@/components/onboarding-overlay").then((m) => ({ default: m.OnboardingOverlay })),
  { ssr: false },
);

const HERO_HEADLINES = [
  { prefix: "What are you in the mood ", gradient: "for tonight?" },
  { prefix: "Find the perfect movie for ", gradient: "your evening" },
  { prefix: "Tell me what you ", gradient: "want to watch" },
  { prefix: "Let's find your next ", gradient: "favorite film" },
  { prefix: "Not sure what to watch? ", gradient: "I can help" },
  { prefix: "Discover movies tailored ", gradient: "just for you" },
  { prefix: "What kind of story are you ", gradient: "looking for?" },
  { prefix: "Your personal cinema guide ", gradient: "is ready" },
  { prefix: "Skip the scrolling, start ", gradient: "watching" },
  { prefix: "Let's find something ", gradient: "amazing to watch" },
];

export default function HomePage() {
  const [genre, setGenre] = useState<number | "all">("all");
  const [countryFilter, setCountryFilter] = useState<string | "all">("all");
  const [movies, setMovies] = useState<Movie[]>(MOCK_MOVIES);
  const [randomGridMovies, setRandomGridMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const signedIn = useAccountStore((s) => s.signedIn);
  const freeUsed = useAccountStore((s) => s.freeUsed);
  const hasSentFirst = useAccountStore((s) => s.hasSentFirst);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const openSearch = useUIStore((s) => s.openSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Movie[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeService, setActiveService] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const chatOpen = useUIStore((s) => s.chatOpen);
  const { type, genres, keywords, yearMin, yearMax, country, network, rating, sort, hasActiveFilters } = useFilterStore();
  const { status } = useSession();
  const openFilter = useUIStore((s) => s.openFilter);
  
  // Taste filtering
  const [dislikedIds, setDislikedIds] = useState<Set<number>>(new Set());
  
  const [dxbTrending, setDxbTrending] = useState<Movie[]>([]);
  const [popularLocal, setPopularLocal] = useState<{ label: string, movies: Movie[] } | null>(null);
  const [newThisWeek, setNewThisWeek] = useState<Movie[]>([]);
  const [userLists, setUserLists] = useState<UserList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Tracks which TMDB page to fetch next for the default home random feed
  const nextRandomPageRef = useRef(2);

  const [heroHeadlineIndex, setHeroHeadlineIndex] = useState(0);

  useEffect(() => {
    // Pick a random starting headline on mount
    setHeroHeadlineIndex(Math.floor(Math.random() * HERO_HEADLINES.length));
    // Cycle through headlines every 7s (synced with hero slide interval)
    const interval = setInterval(() => {
      setHeroHeadlineIndex((prev) => (prev + 1) % HERO_HEADLINES.length);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  // Show feedback modal once user is signed in and has sent 3+ messages.
  // - Both steps done → never show again.
  // - Otherwise show once, then wait 30 days before re-prompting.
  useEffect(() => {
    if (!signedIn || freeUsed < 3) return;
    const { reviewDone, featuresDone, lastPrompted } = loadFeedbackState();
    if (reviewDone && featuresDone) return; // fully done, never prompt
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (lastPrompted && Date.now() - lastPrompted < THIRTY_DAYS) return; // too soon
    const t = setTimeout(() => {
      markFeedbackPrompted();
      setFeedbackOpen(true);
    }, 2000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, freeUsed]);

  const fetchMovies = useCallback(async (selectedGenre: number | "all", selectedProvider: string | null, selectedCountry: string | "all", pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setFetchingMore(true);
    
    try {
      const param = selectedGenre === "all" ? "all" : String(selectedGenre);
      const providerParam = selectedProvider ? `&provider=${encodeURIComponent(selectedProvider)}` : "";
      const countryParam = selectedCountry === "all" ? "" : `&country=${encodeURIComponent(selectedCountry)}`;
      const res = await fetch(`/api/movies?genre=${param}${providerParam}${countryParam}&page=${pageNum}`);
      if (!res.ok) throw new Error("API error");
      let data: Movie[] = await res.json();
      
      if (Array.isArray(data)) {
        // Randomize the order of the default home page movies so "Trending Now" feels fresh
        if (pageNum === 1 && param === "all" && !providerParam) {
          data = [...data].sort(() => 0.5 - Math.random());
        }
        setMovies(prev => pageNum === 1 ? data : [...prev, ...data]);
        if (data.length === 0) setHasMore(false);
      }
    } catch {
      // keep last loaded state
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, []);

  const fetchDiscover = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setFetchingMore(true);

    try {
      const params = new URLSearchParams();
      if (type) params.append("type", type);
      if (genres.length > 0) params.append("genres", genres.join("|"));
      if (keywords) params.append("keywords", keywords);
      if (yearMin) params.append("yearMin", yearMin);
      if (yearMax) params.append("yearMax", yearMax);
      if (country) params.append("country", country);
      if (network) params.append("network", network);
      if (rating) params.append("rating", rating);
      if (sort) params.append("sort", sort);
      params.append("page", String(pageNum));

      const res = await fetch(`/api/movies/discover?${params.toString()}`);
      if (!res.ok) throw new Error("Discover error");
      const data: Movie[] = await res.json();
      
      if (Array.isArray(data)) {
        setMovies(prev => pageNum === 1 ? data : [...prev, ...data]);
        if (data.length === 0) setHasMore(false);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [type, genres, keywords, yearMin, yearMax, country, network, rating, sort]);

  useEffect(() => {
    // Reset to page 1 and hasMore whenever filters change
    setPage(1);
    setHasMore(true);
    nextRandomPageRef.current = 2;
  }, [genre, activeService, countryFilter, type, genres, keywords, yearMin, yearMax, country, network, rating, sort]);

  // Populate the randomGridMovies from the main movies fetch to avoid extra API calls on mount
  useEffect(() => {
    if (movies.length > 0 && randomGridMovies.length === 0 && !loading) {
      setRandomGridMovies([...movies].sort(() => 0.5 - Math.random()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, loading]);

  useEffect(() => {
    const isDefaultHomeState = genre === "all" && countryFilter === "all" && !activeService && !hasActiveFilters() && !searchQuery;
    
    if (page === 1) {
      if (hasActiveFilters()) {
        fetchDiscover(1);
      } else {
        const fetchPage = isDefaultHomeState ? Math.floor(Math.random() * 10) + 1 : 1;
        fetchMovies(genre, activeService, countryFilter, fetchPage);
      }
    } else {
      if (isDefaultHomeState) {
        const fetchRandomMore = async () => {
          try {
            // Use sequential pages (not random) to avoid duplicate posters
            const p1 = nextRandomPageRef.current;
            const p2 = nextRandomPageRef.current + 1;
            nextRandomPageRef.current += 2;
            const [moviesArr, tvArr] = await Promise.all([
              fetch(`/api/movies/discover?page=${p1}`).then((r) => r.json()),
              fetch(`/api/movies/discover?page=${p2}&type=tv`).then((r) => r.json()),
            ]);
            // Both endpoints return arrays directly
            const newMovies: Movie[] = Array.isArray(moviesArr) ? moviesArr : [];
            const newTv: Movie[] = Array.isArray(tvArr) ? tvArr : [];
            const combined = [...newMovies, ...newTv].sort(() => 0.5 - Math.random());

            if (combined.length === 0) {
              setHasMore(false);
            } else {
              setRandomGridMovies((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const unique = combined.filter((m) => !existingIds.has(m.id));
                if (unique.length === 0) setHasMore(false);
                return [...prev, ...unique];
              });
            }
          } catch (e) {
            console.error("Failed to fetch random items for infinite scroll", e);
          } finally {
            setFetchingMore(false);
          }
        };
        fetchRandomMore();
      } else {
        if (hasActiveFilters()) {
          fetchDiscover(page);
        } else {
          fetchMovies(genre, activeService, countryFilter, page);
        }
      }
    }
  }, [page, genre, activeService, countryFilter, fetchMovies, fetchDiscover, hasActiveFilters, searchQuery]);

  // Dynamic Theme Effect
  useEffect(() => {
    let theme = PROVIDER_THEMES.all;
    if (genre !== "all") {
      theme = GENRE_THEMES[genre] || PROVIDER_THEMES.all;
    } else if (activeService) {
      theme = PROVIDER_THEMES[activeService] || PROVIDER_THEMES.all;
    }
    document.documentElement.style.setProperty("--color-primary", theme.hex);
    document.documentElement.style.setProperty("--color-primary-rgb", theme.rgb);
  }, [activeService, genre]);

  useEffect(() => {
    if (loading || fetchingMore || searchQuery || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0, rootMargin: "1500px" }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [loading, fetchingMore, searchQuery, hasMore]);

  useEffect(() => {
    if (searchOpen) {
      setSearchHistory(getSearchHistory());
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // Deep Link Handling for Movies
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const movieId = params.get("m");
    const mediaType = params.get("type") || "movie";
    
    if (movieId) {
      // Clean up URL without reloading
      window.history.replaceState({}, "", "/");
      
      // Fetch movie detail and open drawer
      fetch(`/api/movies/detail?id=${movieId}&type=${mediaType}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            useUIStore.getState().openDetail(data);
          }
        })
        .catch(console.error);
    }
  }, []);

  // Initialize "Not Interested" filters and listen for UI events
  useEffect(() => {
    // 1. Get from local storage (anon)
    import("@/lib/anon-prefs").then((mod) => {
      const prefs = mod.getAnonPrefs();
      if (prefs.notInterested && prefs.notInterested.length > 0) {
        setDislikedIds(prev => new Set([...Array.from(prev), ...prefs.notInterested]));
      }
    });

    // 2. Get from server (auth)
    if (status === "authenticated") {
      fetch("/api/user/reactions")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            const dislikes = data.filter((d: any) => d.reaction === "dislike").map((d: any) => d.movieId);
            if (dislikes.length > 0) {
              setDislikedIds(prev => new Set([...Array.from(prev), ...dislikes]));
            }
          }
        })
        .catch(() => {});
    }

    // 3. Listen to drawer action
    const handleNotInterested = (e: any) => {
      const id = e.detail?.movieId;
      if (id) {
        setDislikedIds(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    };
    window.addEventListener("dxb-not-interested", handleNotInterested);
    return () => window.removeEventListener("dxb-not-interested", handleNotInterested);
  }, [status]);

  // Fetch Trending on DXB
  useEffect(() => {
    fetch("/api/movies/dxb-trending")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDxbTrending(data);
      })
      .catch(() => {});

    // Fetch New This Week
    fetch("/api/movies/discover?sort=Latest Release")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setNewThisWeek(data);
      })
      .catch(() => {});

    // Fetch Popular in Region
    import("@/lib/anon-prefs").then((mod) => {
      const topCountry = mod.getTopCountry();
      if (!topCountry) return; // Skip if we don't have a regional preference yet
      
      let cLabel = topCountry;
      try {
        cLabel = new Intl.DisplayNames(['en'], { type: 'region' }).of(topCountry) || topCountry;
      } catch (e) {
        // Fallback
      }
      
      fetch(`/api/movies/discover?sort=Popular&country=${topCountry}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setPopularLocal({ label: `Popular in ${cLabel}`, movies: data });
        })
        .catch(() => {});
    });
  }, []);

  // Fetch user lists for home page pills
  useEffect(() => {
    fetch("/api/lists")
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setUserLists(data); })
      .catch(() => {});
  }, [status]);

  // Heartbeat: update online status every 5 minutes while on the page
  useEffect(() => {
    if (status !== "authenticated") return;
    const ping = () => fetch("/api/user/heartbeat", { method: "POST" }).catch(() => {});
    ping(); // immediate ping on mount
    const interval = setInterval(ping, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Read anonymous prefs on mount to pre-select top genre/country
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (hasAutoSelectedRef.current) return;
    
    // Only pre-select if we are on the default home view (no filters/search active)
    const isDefaultHomeState = genre === "all" && countryFilter === "all" && !activeService && !hasActiveFilters() && !searchQuery;
    
    if (isDefaultHomeState) {
      const topGenre = getTopGenre();
      const topCountry = getTopCountry();
      
      // We don't want to auto-select BOTH immediately and confuse the user, 
      // let's prioritize their absolute favorite signal
      if (topGenre) {
        setGenre(topGenre);
        hasAutoSelectedRef.current = true;
      } else if (topCountry) {
        setCountryFilter(topCountry);
        hasAutoSelectedRef.current = true;
      } else {
        // No top genre/country found, but we checked.
        hasAutoSelectedRef.current = true;
      }
    } else {
      // If they already have a filter active somehow on load, don't override it later.
      hasAutoSelectedRef.current = true;
    }
  }, [status, genre, countryFilter, activeService, hasActiveFilters, searchQuery]);

  function handleSearch(value: string) {
    setSearchQuery(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!value.trim()) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        trackSearch(value.trim());
        saveSearchQuery(value.trim());
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(value.trim())}`);
        const data: Movie[] = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
        // Update history view if user clears the bar later
        setSearchHistory(getSearchHistory());
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchResults(null);
  }

  function collapseSearch() {
    clearSearch();
    closeSearch();
  }




  const displayMovies = (searchResults ?? movies).filter(m => !dislikedIds.has(m.id));
  const displayLoading = searchResults === null ? loading : searchLoading;
  const isDefaultHome = genre === "all" && countryFilter === "all" && !hasActiveFilters() && !searchQuery && !searchOpen;

  return (
    <div className={cn("relative min-h-dvh transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
      <SideNav />
      {!isDefaultHome && countryFilter === "all" && (
        <div 
          className={cn("pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-30", chatOpen && "invisible lg:visible")}
          style={{
            background: "linear-gradient(to bottom, var(--color-primary) 0%, transparent 100%)"
          }}
        />
      )}
      {!isDefaultHome && countryFilter !== "all" && (
        <>
          <div 
            className={cn("pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-[0.10] bg-cover bg-center blur-3xl", chatOpen && "invisible lg:visible")}
            style={{ backgroundImage: `url('https://flagcdn.com/w1280/${countryFilter.toLowerCase()}.webp')` }}
          />
          <div 
            className={cn("pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-[0.25] bg-cover bg-center", chatOpen && "invisible lg:visible")}
            style={{
              backgroundImage: `url('https://flagcdn.com/w1280/${countryFilter.toLowerCase()}.webp')`,
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)"
            }}
          />
        </>
      )}

      <div className={cn("relative mx-auto w-full max-w-app pb-24 lg:max-w-6xl lg:pb-12 xl:max-w-7xl", chatOpen && "invisible lg:visible")}>
        
        {isDefaultHome ? (
          <HeroBackground movies={movies} onMovieClick={useUIStore.getState().openDetail}>
            {/* AI-first hero headline */}
            <div className="mx-auto max-w-lg mt-6 lg:mt-10">
              {/* Eyebrow */}
              <button 
                onClick={() => useUIStore.getState().openChat()}
                className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4 transition hover:bg-primary/20 active:scale-95 cursor-pointer"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-medium text-primary flex items-center gap-1">
                  Ask AI what to watch
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </button>

              {/* Headline — key remount triggers fade-in; Safari always paints fresh text */}
              <h1
                key={heroHeadlineIndex}
                className="animate-in fade-in duration-700 text-3xl lg:text-5xl font-extrabold text-white leading-[1.1] tracking-tight"
              >
                {HERO_HEADLINES[heroHeadlineIndex].prefix}
                <span className="text-primary">
                  {HERO_HEADLINES[heroHeadlineIndex].gradient}
                </span>
              </h1>
            </div>
          </HeroBackground>
        ) : (
          <div className="px-5 pt-16 lg:px-10 lg:pt-20 mb-8 lg:mb-12 h-20" />
        )}

        <section className={cn(
          "relative z-40 px-5 lg:px-10",
          isDefaultHome ? "mt-[-1rem]" : "mt-8 lg:mt-12"
        )}>
          {searchOpen && (
            <div className="mb-5 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search movies & shows…"
                  className="w-full rounded-full border border-border bg-surface py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-text-secondary focus:border-primary/60 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={collapseSearch}
                  aria-label="Close search"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={openFilter}
                aria-label="Open filters"
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-secondary transition hover:border-primary/50 hover:text-white",
                  hasActiveFilters() && "border-primary text-primary"
                )}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          )}

          {searchOpen && !searchQuery && searchHistory.length > 0 && (
            <div className="mb-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Recent Searches</h3>
                <button 
                  onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
                  className="text-xs text-text-secondary transition hover:text-white"
                >
                  Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map(query => (
                  <button
                    key={query}
                    onClick={() => handleSearch(query)}
                    className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-secondary transition hover:border-primary/50 hover:text-white hover:bg-surface/80"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!searchQuery && (
            <section className="mb-5">
              <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto pb-1 sm:mx-0 sm:px-0">
                {STREAMING_SERVICES.map((s) => {
                  const active = activeService === s.slug;
                  return (
                    <button
                      key={s.slug}
                      type="button"
                      title={`Filter by ${s.label}`}
                      onClick={() => {
                        trackProvider(s.slug);
                        setActiveService(active ? null : s.slug);
                      }}
                      className={cn(
                        "relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-2xl border transition active:scale-95",
                        active
                          ? "border-primary shadow-glow ring-2 ring-primary/50"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <Image
                        src={s.icon}
                        alt={s.label}
                        fill
                        sizes="88px"
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/15" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {!searchQuery && (
            <>
              <GenrePills 
                selected={genre} 
                onSelect={(g) => {
                  if (g !== "all") trackGenre(g);
                  setGenre(g);
                  setActiveListId(null);
                }} 
              />
              <div className="mt-2" />
              <CountryPills 
                selected={countryFilter} 
                onSelect={(c) => {
                  if (c !== "all") trackCountry(c);
                  setCountryFilter(c);
                  setActiveListId(null);
                }} 
              />
              {/* User-created list pills */}
              {userLists.length > 0 && (
                <div className="mt-2 no-scrollbar -mx-5 flex gap-2 overflow-x-auto pb-1 px-0">
                  {userLists.map((list) => (
                    <button
                      key={list._id}
                      type="button"
                      onClick={() => setActiveListId(activeListId === list._id ? null : list._id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition whitespace-nowrap",
                        activeListId === list._id
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-white/15 bg-white/[0.05] text-white/70 hover:border-white/30 hover:text-white"
                      )}
                    >
                      {list.creatorOnline && (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                      )}
                      {list.name.length > 28 ? list.name.slice(0, 28) + "…" : list.name}
                      <span className="text-white/30">{list.items.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {isDefaultHome && (
          <div className="relative z-20 mt-3 lg:mt-5 space-y-8">
            {dxbTrending.length > 0 && (
              <MovieCarousel 
                title="Trending on DXB" 
                movies={dxbTrending.filter(m => !dislikedIds.has(m.id))} 
                />
            )}
            {popularLocal && popularLocal.movies.length > 0 && (
              <MovieCarousel 
                title={popularLocal.label} 
                movies={popularLocal.movies.filter(m => !dislikedIds.has(m.id))} 
              />
            )}
            {newThisWeek.length > 0 && (
              <MovieCarousel 
                title="New This Week" 
                movies={newThisWeek.filter(m => !dislikedIds.has(m.id))} 
              />
            )}
            <MovieCarousel 
              title="Global Hits" 
              movies={movies.filter(m => !dislikedIds.has(m.id))} 
              size="large"
              action={
                !searchOpen && (
                  <button
                    type="button"
                    onClick={() => openSearch()}
                    aria-label="Open search"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-text-secondary transition hover:text-white"
                  >
                    <Search size={18} />
                  </button>
                )
              }
            />
          </div>
        )}

        <section className="px-5 lg:px-10">
          {/* Active list header */}
          {activeListId && (() => {
            const activeList = userLists.find(l => l._id === activeListId);
            if (!activeList) return null;
            return (
              <div className="flex items-center justify-between mb-3 mt-4">
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">Viewing List</p>
                  <h2 className="text-sm font-bold text-white mt-0.5 leading-snug">{activeList.name}</h2>
                </div>
                <button
                  onClick={() => setActiveListId(null)}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:text-white transition"
                >
                  Clear
                </button>
              </div>
            );
          })()}

          <div className="-mx-5 mt-4 grid grid-cols-2 gap-2 sm:mx-0 sm:gap-3 lg:mt-6 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
            {activeListId
              ? (() => {
                  const activeList = userLists.find(l => l._id === activeListId);
                  if (!activeList) return null;
                  return activeList.items.map(item => (
                    <MoviePosterCard
                      key={item.id}
                      movie={{
                        id: item.id,
                        title: item.title,
                        year: item.year,
                        rating: item.rating || 0,
                        posterPath: item.posterPath,
                        backdropPath: null,
                        overview: "",
                        genres: [],
                        cast: [],
                        mediaType: item.mediaType,
                      }}
                    />
                  ));
                })()
              : displayLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface" />
                  ))
                : (isDefaultHome && !activeService && randomGridMovies.length > 0 ? randomGridMovies : displayMovies).map((m) => <MoviePosterCard key={m.id} movie={m} />)
            }
          </div>

          {!displayLoading && displayMovies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              {searchQuery ? (
                <p className="text-sm text-text-secondary">No results for "{searchQuery}"</p>
              ) : activeService ? (
                <div className="flex flex-col items-center max-w-sm px-6">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-surface shadow-glow">
                    <Film className="h-8 w-8 text-primary-pink" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    Coming Soon to {STREAMING_SERVICES.find(s => s.slug === activeService)?.label}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    We're working on expanding our catalog for this provider. New movies and TV shows will be available here soon!
                  </p>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-text-secondary">
                  Nothing here yet. Try another genre.
                </p>
              )}
            </div>
          )}

          {/* Infinite Scroll Sentinel */}
          {!searchQuery && displayMovies.length > 0 && (
            <div ref={loadMoreRef} className="mt-8 flex h-20 items-center justify-center">
              {fetchingMore && (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              )}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
      <FloatingChatOrb />
      <MenuDrawer />
      <ChatDrawer />
      <FilterDrawer />
      <MovieDetailDrawer />
      <TrailerModal />
      <GoogleGate />
      <EngagementNudge />
      <OnboardingOverlay />
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
