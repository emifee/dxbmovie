import { headers } from "next/headers";

/**
 * Extracts the user's preferred language from the Accept-Language header.
 * Returns a TMDB-compatible ISO 639-1 / ISO 3166-1 tag (e.g. "en-US", "es-ES").
 * Defaults to "en-US" if missing or unparseable.
 */
export function getLanguage(): string {
  try {
    const headersList = headers();
    const acceptLanguage = headersList.get("accept-language");
    
    if (acceptLanguage) {
      // e.g. "es-MX,es;q=0.9,en;q=0.8" -> "es-MX"
      const topLang = acceptLanguage.split(",")[0].trim();
      if (topLang) {
        return topLang;
      }
    }
  } catch (error) {
    // Failsafe in case headers() is called outside a valid server context
    console.error("Failed to read accept-language header", error);
  }
  
  return "en-US";
}
