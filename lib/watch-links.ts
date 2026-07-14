/**
 * Centralized helper for generating direct streaming platform URLs.
 *
 * Returns a direct search URL on the streaming platform for the given title,
 * or null if the provider is unknown (in which case the chip should be non-clickable).
 *
 * Future-proofing: Add affiliate/tracking params per-provider in one place here.
 */

// Map TMDB provider_name → a function that returns the direct platform search URL.
const PROVIDER_MAP: Record<string, (title: string) => string> = {
  // --- Subscription (flatrate) ---
  "Netflix":          (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  "Amazon Prime Video": (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
  "Prime Video":      (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
  "Disney Plus":      (t) => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
  "Disney+":          (t) => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
  "Apple TV Plus":    (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  "Apple TV+":        (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  "Max":              (t) => `https://www.max.com/search?q=${encodeURIComponent(t)}`,
  "HBO Max":          (t) => `https://www.max.com/search?q=${encodeURIComponent(t)}`,
  "Hulu":             (t) => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`,
  "Paramount Plus":   (t) => `https://www.paramountplus.com/search/?query=${encodeURIComponent(t)}`,
  "Paramount+":       (t) => `https://www.paramountplus.com/search/?query=${encodeURIComponent(t)}`,
  "Peacock":          (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
  "Peacock Premium":  (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
  "Crunchyroll":      (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}`,
  "Mubi":             (t) => `https://mubi.com/en/films?search=${encodeURIComponent(t)}`,
  "BritBox":          (t) => `https://www.britbox.com/us/searchresults?q=${encodeURIComponent(t)}`,
  "Showtime":         (t) => `https://www.sho.com/search#${encodeURIComponent(t)}`,
  "Starz":            (t) => `https://www.starz.com/us/en/search?q=${encodeURIComponent(t)}`,
  "fuboTV":           (t) => `https://www.fubo.tv/welcome/search?q=${encodeURIComponent(t)}`,
  "Shudder":          (t) => `https://www.shudder.com/search/${encodeURIComponent(t)}`,
  "Tubi TV":          (t) => `https://tubitv.com/search/${encodeURIComponent(t)}`,
  "Tubi":             (t) => `https://tubitv.com/search/${encodeURIComponent(t)}`,
  "Pluto TV":         (t) => `https://pluto.tv/search?query=${encodeURIComponent(t)}`,
};

/**
 * Returns a direct outbound URL for a known streaming provider, or null if unknown.
 * A null return means the chip should be rendered as non-clickable.
 */
export function getWatchLink(providerName: string, _movieId: number, title: string): string | null {
  const builder = PROVIDER_MAP[providerName];
  if (!builder) return null; // Unknown provider → block the click
  return builder(title);
}

