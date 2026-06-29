/**
 * Utility for firing custom GA4 events.
 * Make sure window.gtag is available (initialized in layout.tsx).
 */
export function trackEvent(
  eventName: string,
  eventParams?: Record<string, string | number | boolean>
) {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", eventName, eventParams);
  }
}
