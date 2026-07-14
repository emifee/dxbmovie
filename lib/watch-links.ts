/**
 * Centralized helper for generating outbound streaming links.
 * 
 * Future-proofing: This function is the single choke point for generating outbound watch URLs. 
 * If affiliate tracking or commission IDs are introduced later, they can be wired in here 
 * seamlessly using the `providerName` without needing a full UI rebuild.
 */
export function getWatchLink(providerName: string, movieId: number, fallbackLink: string | null = null): string {
  // If we have a direct link from JustWatch/TMDB, use it.
  if (fallbackLink) {
    return fallbackLink;
  }
  
  // Fallback search link if no direct provider link exists
  return `https://www.google.com/search?q=watch+movie+${movieId}+on+${encodeURIComponent(providerName)}`;
}
