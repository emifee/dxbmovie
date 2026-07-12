/**
 * Anonymous user preference tracking.
 * Stores all taste signals in localStorage for instant reads,
 * and syncs to MongoDB in the background via /api/anon/sync.
 */

import { getDeviceId } from "./device-id";

const STORAGE_KEY = "dxb_anon_prefs";
const SYNC_DEBOUNCE_MS = 3000;

export type AnonPrefs = {
  genres: Record<string, number>;      // genreId → click count
  countries: Record<string, number>;   // countryCode → click count
  providers: Record<string, number>;   // providerSlug → click count
  watchedMovies: number[];             // TMDB movie IDs
  watchedReels: number[];              // TMDB movie IDs from reels
  searches: string[];                  // recent search queries
  notInterested: number[];             // TMDB movie IDs user dislikes
  totalInteractions: number;
  lastSeen: number;                    // timestamp
};

const DEFAULT_PREFS: AnonPrefs = {
  genres: {},
  countries: {},
  providers: {},
  watchedMovies: [],
  watchedReels: [],
  searches: [],
  notInterested: [],
  totalInteractions: 0,
  lastSeen: Date.now(),
};

// In-memory debounce timer for server sync
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Read current prefs from localStorage */
export function getAnonPrefs(): AnonPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Write prefs to localStorage + schedule background server sync */
function savePrefs(prefs: AnonPrefs) {
  if (typeof window === "undefined") return;
  prefs.lastSeen = Date.now();
  prefs.totalInteractions += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  scheduleSyncToServer(prefs);
}

/** Debounced background sync to MongoDB */
function scheduleSyncToServer(prefs: AnonPrefs) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const deviceId = getDeviceId();
    if (!deviceId) return;
    // Fire-and-forget — never block the UI
    fetch("/api/anon/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, prefs }),
    }).catch(() => {/* ignore network errors silently */});
  }, SYNC_DEBOUNCE_MS);
}

/** Increment score for a genre click */
export function trackGenre(genreId: number | string) {
  const prefs = getAnonPrefs();
  const key = String(genreId);
  prefs.genres[key] = (prefs.genres[key] ?? 0) + 1;
  savePrefs(prefs);
}

/** Increment score for a country tap */
export function trackCountry(countryCode: string) {
  if (!countryCode || countryCode === "all") return;
  const prefs = getAnonPrefs();
  prefs.countries[countryCode] = (prefs.countries[countryCode] ?? 0) + 1;
  savePrefs(prefs);
}

/** Increment score for a streaming provider click */
export function trackProvider(slug: string) {
  if (!slug) return;
  const prefs = getAnonPrefs();
  prefs.providers[slug] = (prefs.providers[slug] ?? 0) + 1;
  savePrefs(prefs);
}

/** Record a movie detail view */
export function trackMovieView(tmdbId: number) {
  const prefs = getAnonPrefs();
  if (!prefs.watchedMovies.includes(tmdbId)) {
    prefs.watchedMovies = [tmdbId, ...prefs.watchedMovies].slice(0, 100);
    savePrefs(prefs);
  }
}

/** Record a reel watch (called when >50% played) */
export function trackReelWatch(tmdbId: number) {
  const prefs = getAnonPrefs();
  if (!prefs.watchedReels.includes(tmdbId)) {
    prefs.watchedReels = [tmdbId, ...prefs.watchedReels].slice(0, 100);
    savePrefs(prefs);
  }
}

/** Record that user is not interested in a movie */
export function trackNotInterested(tmdbId: number) {
  const prefs = getAnonPrefs();
  // Ensure we initialize it for backward compatibility with old local storage
  if (!prefs.notInterested) prefs.notInterested = [];
  if (!prefs.notInterested.includes(tmdbId)) {
    prefs.notInterested = [tmdbId, ...prefs.notInterested].slice(0, 500); // Store up to 500 explicit dislikes
    savePrefs(prefs);
  }
}

/** Record a search query */
export function trackSearch(query: string) {
  if (!query.trim()) return;
  const prefs = getAnonPrefs();
  // Deduplicate, keep most recent at front
  prefs.searches = [query.trim(), ...prefs.searches.filter(s => s !== query.trim())].slice(0, 30);
  savePrefs(prefs);
}

/** Returns the single top genre ID (by click count), or null */
export function getTopGenre(): number | null {
  const prefs = getAnonPrefs();
  const entries = Object.entries(prefs.genres);
  if (entries.length === 0) return null;
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return top ? Number(top[0]) : null;
}

/** Returns the single top country code (by click count), or null */
export function getTopCountry(): string | null {
  const prefs = getAnonPrefs();
  const entries = Object.entries(prefs.countries);
  if (entries.length === 0) return null;
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/** Merge anonymous prefs into a signed-in user's account (called on sign-up) */
export function clearAnonPrefs() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
