import { create } from "zustand";
import type { Movie } from "./types";

// Global UI state for the overlays that can be opened from anywhere (bottom
// nav, movie cards, chat entry card). Kept deliberately small — server data
// lives in its own fetching layer later.
interface UIState {
  // Chat drawer
  chatOpen: boolean;
  // Optional movie context the chat opens pre-loaded with ("Ask AI about this")
  chatMovieContext: Movie | null;
  openChat: (movie?: Movie) => void;
  closeChat: () => void;

  // Movie detail drawer
  detailMovie: Movie | null;
  openDetail: (movie: Movie) => void;
  closeDetail: () => void;

  // Navigation menu (hamburger / mobile side menu)
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;

  // Desktop sidebar collapse (icons-only rail). Lives here so page content
  // can shift its left offset in sync. Persisted to localStorage.
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  // In-app trailer player (YouTube embed). Holds the active video key + title.
  trailer: { key: string; title: string; movieId?: number; mediaType?: "movie" | "tv" } | null;
  openTrailer: (key: string, title: string, movieId?: number, mediaType?: "movie" | "tv") => void;
  closeTrailer: () => void;

  // In-chat floating trailer player
  chatTrailer: { key: string; title: string; movieId?: number; mediaType?: "movie" | "tv" } | null;
  openChatTrailer: (key: string, title: string, movieId?: number, mediaType?: "movie" | "tv") => void;
  closeChatTrailer: () => void;

  // Gmail-only sign-in gate (shown after the anonymous user's first reply).
  authGateOpen: boolean;
  openAuthGate: () => void;
  closeAuthGate: () => void;

  // Search panel (toggled from bottom nav or providers header).
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;

  filterOpen: boolean;
  openFilter: () => void;
  closeFilter: () => void;

  // Holds a drafted chat message recovered from localStorage after sign-in
  pendingChatMessage: string | null;
  setPendingChatMessage: (msg: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  chatOpen: false,
  chatMovieContext: null,
  openChat: (movie) => set({ chatOpen: true, chatMovieContext: movie ?? null }),
  closeChat: () => set({ chatOpen: false }),

  pendingChatMessage: null,
  setPendingChatMessage: (msg) => set({ pendingChatMessage: msg }),

  detailMovie: null,
  openDetail: (movie) => set({ detailMovie: movie }),
  closeDetail: () => set({ detailMovie: null }),

  menuOpen: false,
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),

  // Initialized from localStorage on the client (see useSidebarHydration).
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      if (typeof window !== "undefined") {
        localStorage.setItem("dxb:sidebar-collapsed", String(next));
      }
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

  trailer: null,
  openTrailer: (key, title, movieId, mediaType) => set({ trailer: { key, title, movieId, mediaType } }),
  closeTrailer: () => set({ trailer: null }),

  chatTrailer: null,
  openChatTrailer: (key, title, movieId, mediaType) => set({ chatTrailer: { key, title, movieId, mediaType } }),
  closeChatTrailer: () => set({ chatTrailer: null }),

  authGateOpen: false,
  openAuthGate: () => set({ authGateOpen: true }),
  closeAuthGate: () => set({ authGateOpen: false }),

  searchOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  filterOpen: false,
  openFilter: () => set({ filterOpen: true }),
  closeFilter: () => set({ filterOpen: false }),
}));

export interface FilterState {
  type: "movie" | "tv" | "anime" | "drama" | "manga" | "";
  genre: string;
  year: string;
  country: string;
  network: string;
  rating: string;
  sort: string;
}

const defaultFilters: FilterState = {
  type: "",
  genre: "",
  year: "",
  country: "",
  network: "",
  rating: "",
  sort: "Popular",
};

interface FilterStore extends FilterState {
  setFilter: (key: keyof FilterState, value: string) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  ...defaultFilters,
  setFilter: (key, value) => set({ [key]: value }),
  clearFilters: () => set(defaultFilters),
  hasActiveFilters: () => {
    const s = get();
    return s.type !== "" || s.genre !== "" || s.year !== "" || s.country !== "" || s.network !== "" || s.rating !== "" || s.sort !== "Popular";
  },
}));
