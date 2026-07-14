import type { WatchProvider } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Enriches a list of TMDB items with watch providers by making parallel requests.
 * Uses the request's IP country if possible, falls back to US.
 */
export async function enrichWithProviders(
  items: any[], 
  apiKey: string, 
  countryCode: string = "US"
) {
  // Only process up to 20 items to prevent huge parallel bursts, though typical is 20 per page.
  const toProcess = items.slice(0, 20);

  const enriched = await Promise.all(
    toProcess.map(async (item) => {
      const type = item.media_type || (item.name ? "tv" : "movie");
      try {
        const fetchUrl = `${TMDB_BASE}/${type}/${item.id}/watch/providers?api_key=${apiKey}`;
        // We use fetch with cache instead of revalidating every time to keep it extremely fast
        const res = await fetch(fetchUrl, { next: { revalidate: 3600 } });
        if (!res.ok) return { ...item, providers: [] };

        const data = await res.json();
        const watchData =
          data.results?.[countryCode] ||
          data.results?.US ||
          {};

        // Extract flatrate (streaming) providers, max 3 to keep badges clean
        const flatrateProviders = watchData.flatrate || [];
        // Build a direct JustWatch search link for this title.
        // TMDB's watchData.link goes to themoviedb.org which redirects to JustWatch anyway —
        // we skip the middleman and build the JustWatch URL directly so users land on a
        // real page with clickable provider links rather than a TMDB wrapper.
        const titleForUrl = (item.title || item.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const justWatchLink = titleForUrl
          ? `https://www.justwatch.com/us/movie/${titleForUrl}`
          : (watchData.link || null);

        const providers: WatchProvider[] = flatrateProviders.slice(0, 3).map((p: any) => ({
          name: p.provider_name,
          logoPath: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
          link: justWatchLink,
        }));

        return { ...item, _providers: providers };
      } catch (e) {
        return { ...item, _providers: [] };
      }
    })
  );

  return enriched;
}
