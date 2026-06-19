"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Search, X, SlidersHorizontal, Film } from "lucide-react";
import { ChatEntryCard } from "@/components/chat-entry-card";
import { GenrePills } from "@/components/genre-pills";
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
import { cn } from "@/lib/utils";
import { MOCK_MOVIES } from "@/lib/mock-data";
import { STREAMING_SERVICES, PROVIDER_THEMES } from "@/lib/constants";
import type { Movie } from "@/lib/types";

const OnboardingOverlay = dynamic(
  () => import("@/components/onboarding-overlay").then((m) => ({ default: m.OnboardingOverlay })),
  { ssr: false },
);

export default function HomePage() {
  const [genre, setGenre] = useState<number | "all">("all");
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
  const [searchResults, setSearchResults] = useState<Movie[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeService, setActiveService] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const chatOpen = useUIStore((s) => s.chatOpen);
  const { type, genre: filterGenre, year, country, network, rating, sort, hasActiveFilters } = useFilterStore();
  const openFilter = useUIStore((s) => s.openFilter);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Tracks which TMDB page to fetch next for the default home random feed
  const nextRandomPageRef = useRef(2);

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

  const fetchMovies = useCallback(async (selectedGenre: number | "all", selectedProvider: string | null, pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setFetchingMore(true);
    
    try {
      const param = selectedGenre === "all" ? "all" : String(selectedGenre);
      const providerParam = selectedProvider ? `&provider=${encodeURIComponent(selectedProvider)}` : "";
      const res = await fetch(`/api/movies?genre=${param}${providerParam}&page=${pageNum}`);
      if (!res.ok) throw new Error("API error");
      const data: Movie[] = await res.json();
      
      if (Array.isArray(data)) {
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
      if (filterGenre) params.append("genre", filterGenre);
      if (year) params.append("year", year);
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
  }, [type, filterGenre, year, country, network, rating, sort]);

  useEffect(() => {
    // Reset to page 1 and hasMore whenever filters change
    setPage(1);
    setHasMore(true);
    nextRandomPageRef.current = 2;
  }, [genre, activeService, type, filterGenre, year, country, network, rating, sort]);

  useEffect(() => {
    async function loadRandom() {
      try {
        const p1 = Math.floor(Math.random() * 5) + 1;
        const p2 = Math.floor(Math.random() * 5) + 1;
        const [resMovies, resTv] = await Promise.all([
          fetch(`/api/movies/discover?sort=Popular&type=movie&page=${p1}`),
          fetch(`/api/movies/discover?sort=Popular&type=tv&page=${p2}`)
        ]);
        const dataMovies = await resMovies.json();
        const dataTv = await resTv.json();
        const combined = [...(Array.isArray(dataMovies) ? dataMovies : []), ...(Array.isArray(dataTv) ? dataTv : [])];
        setRandomGridMovies(combined.sort(() => 0.5 - Math.random()));
      } catch (e) {
        console.error(e);
      }
    }
    loadRandom();
  }, []);

  useEffect(() => {
    const isDefaultHomeState = genre === "all" && !activeService && !hasActiveFilters() && !searchQuery;
    
    if (page === 1) {
      if (hasActiveFilters()) {
        fetchDiscover(1);
      } else {
        const fetchPage = isDefaultHomeState ? Math.floor(Math.random() * 5) + 1 : 1;
        fetchMovies(genre, activeService, fetchPage);
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
          fetchMovies(genre, activeService, page);
        }
      }
    }
  }, [page, genre, activeService, fetchMovies, fetchDiscover, hasActiveFilters, searchQuery]);

  // Dynamic Theme Effect
  useEffect(() => {
    const theme = activeService ? PROVIDER_THEMES[activeService] || PROVIDER_THEMES.all : PROVIDER_THEMES.all;
    document.documentElement.style.setProperty("--color-primary", theme.hex);
    document.documentElement.style.setProperty("--color-primary-rgb", theme.rgb);
  }, [activeService]);

  useEffect(() => {
    if (loading || fetchingMore || searchQuery || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1, rootMargin: "400px" }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [loading, fetchingMore, searchQuery, hasMore]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function handleSearch(value: string) {
    setSearchQuery(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!value.trim()) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(value.trim())}`);
        const data: Movie[] = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
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




  const displayMovies = searchResults ?? movies;
  const displayLoading = searchResults === null ? loading : searchLoading;
  const isDefaultHome = genre === "all" && !hasActiveFilters() && !searchQuery && !searchOpen;

  return (
    <div className={cn("relative min-h-dvh transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
      <SideNav />
      {!isDefaultHome && (
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/15 to-transparent", chatOpen && "invisible lg:visible")} />
      )}

      <div className={cn("relative mx-auto w-full max-w-app pb-24 lg:max-w-6xl lg:pb-12 xl:max-w-7xl", chatOpen && "invisible lg:visible")}>
        
        {isDefaultHome ? (
          <HeroBackground movies={movies}>
            <div className="mx-auto max-w-2xl px-5">
              <ChatEntryCard />
            </div>
          </HeroBackground>
        ) : (
          <div className="px-5 pt-16 lg:px-10 lg:pt-20 mb-8 lg:mb-12">
            <ChatEntryCard />
          </div>
        )}

        <section className={cn(isDefaultHome ? "mt-[-2rem] relative z-20" : "mt-8 lg:mt-12", "px-5 lg:px-10")}>
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
                  onClick={searchQuery ? clearSearch : collapseSearch}
                  aria-label={searchQuery ? "Clear search" : "Close search"}
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

          {!searchQuery && (
            <section className="mb-5">
              <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto pb-1 sm:mx-0 sm:px-0">
                {STREAMING_SERVICES.map((s) => {
                  const active = activeService === s.slug;
                  return (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => setActiveService(active ? null : s.slug)}
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

          {!searchQuery && <GenrePills selected={genre} onSelect={setGenre} />}
        </section>

        {isDefaultHome && (
          <div className="relative z-20 mt-6 lg:mt-8">
            <MovieCarousel 
              title="Trending Now" 
              movies={movies} 
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
          <div className="-mx-5 mt-4 grid grid-cols-2 gap-2 sm:mx-0 sm:gap-3 lg:mt-6 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
            {displayLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface" />
                ))
              : (isDefaultHome && !activeService && randomGridMovies.length > 0 ? randomGridMovies : displayMovies).map((m) => <MoviePosterCard key={m.id} movie={m} />)}
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
