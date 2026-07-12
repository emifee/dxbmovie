import type { Genre } from "./types";

// Genre pills shown on the homepage browse row. IDs are TMDB genre IDs so the
// /discover call needs no translation layer.
export const GENRES: Genre[] = [
  { id: "all", label: "All" },
  { id: 28, label: "Action" },
  { id: 12, label: "Adventure" },
  { id: 16, label: "Animation" },
  { id: 80, label: "Crime" },
  { id: 35, label: "Comedy" },
  { id: 99, label: "Documentary" },
  { id: 18, label: "Drama" },
  { id: 10751, label: "Family" },
  { id: 14, label: "Fantasy" },
  { id: 36, label: "History" },
  { id: 27, label: "Horror" },
  { id: 10402, label: "Music" },
  { id: 9648, label: "Mystery" },
  { id: 10749, label: "Romance" },
  { id: 878, label: "Sci-Fi" },
  { id: 53, label: "Thriller" },
  { id: 10752, label: "War" },
  { id: 37, label: "Western" },
];

// Global streaming services, used in onboarding + profile settings and to
// filter TMDB watch providers. Icons: simpleicons.org CDN where available,
// local /public/icons/ SVGs as fallback for slugs the CDN doesn't host.
export const STREAMING_SERVICES = [
  { slug: "netflix", label: "Netflix", icon: "/Provider/Netflix.jpg", tmdbProviderId: 8 },
  { slug: "prime", label: "Prime Video", icon: "/Provider/Prime video.JPG", tmdbProviderId: 9 },
  { slug: "max", label: "Max", icon: "/Provider/max.JPG", tmdbProviderId: 1899 },
  { slug: "hulu", label: "Hulu", icon: "/Provider/Hulu.JPG", tmdbProviderId: 15 },
  { slug: "apple", label: "Apple TV+", icon: "/Provider/AppleTV.JPG", tmdbProviderId: 350 },
  { slug: "paramount", label: "Paramount+", icon: "/Provider/Paramount+.jpg", tmdbProviderId: 531 },
  { slug: "peacock", label: "Peacock", icon: "/Provider/peacock.jpg", tmdbProviderId: 386 },
  { slug: "tubi", label: "Tubi", icon: "/Provider/tubi.PNG", tmdbProviderId: 73 },
  { slug: "plutotv", label: "Pluto TV", icon: "/Provider/plutoTV.jpg", tmdbProviderId: 300 },
  { slug: "amcplus", label: "AMC+", icon: "/Provider/амс+.PNG", tmdbProviderId: 528 },
  { slug: "shudder", label: "Shudder", icon: "/Provider/SHUDDER.JPG", tmdbProviderId: 99 },
  { slug: "mubi", label: "MUBI", icon: "/Provider/MUBI.PNG", tmdbProviderId: 11 },
  { slug: "crunchyroll", label: "Crunchyroll", icon: "/Provider/crunchyroll.jpg", tmdbProviderId: 283 },
  { slug: "curiosity", label: "Curiosity Stream", icon: "/Provider/Curiosity STREAM.PNG", tmdbProviderId: 190 },
  { slug: "mgmplus", label: "MGM+", icon: "/Provider/MGM+.PNG", tmdbProviderId: 584 },
  { slug: "youtubetv", label: "YouTube TV", icon: "/Provider/YouTube TV.PNG", tmdbProviderId: 188 },
  { slug: "britbox", label: "BritBox", icon: "/Provider/britbox.PNG", tmdbProviderId: 151 },
  { slug: "rakuten", label: "Rakuten TV", icon: "/Provider/Rakuten TV.PNG", tmdbProviderId: 35 },
] as const;

export const PROVIDER_THEMES: Record<string, { hex: string; rgb: string }> = {
  all: { hex: "#8B5CF6", rgb: "139, 92, 246" }, // Default Purple
  netflix: { hex: "#E50914", rgb: "229, 9, 20" }, // Red
  prime: { hex: "#00A8E1", rgb: "0, 168, 225" }, // Blue
  max: { hex: "#C0C0C0", rgb: "192, 192, 192" }, // Silver
  hulu: { hex: "#1CE783", rgb: "28, 231, 131" }, // Green
  apple: { hex: "#FF2D55", rgb: "255, 45, 85" }, // Pink
  paramount: { hex: "#0064FF", rgb: "0, 100, 255" }, // Blue
  peacock: { hex: "#FFB800", rgb: "255, 184, 0" }, // Yellow
  tubi: { hex: "#F37720", rgb: "243, 119, 32" }, // Orange
  plutotv: { hex: "#FFFF00", rgb: "255, 255, 0" }, // Yellow
  amcplus: { hex: "#FFB800", rgb: "255, 184, 0" }, // Orange/Yellow
  shudder: { hex: "#FF0000", rgb: "255, 0, 0" }, // Red
  mubi: { hex: "#000000", rgb: "0, 0, 0" }, // Black
  crunchyroll: { hex: "#F47521", rgb: "244, 117, 33" }, // Orange
  curiosity: { hex: "#EDA921", rgb: "237, 169, 33" }, // Yellow
  mgmplus: { hex: "#D4AF37", rgb: "212, 175, 55" }, // Gold
  youtubetv: { hex: "#FF0000", rgb: "255, 0, 0" }, // Red
  britbox: { hex: "#00325B", rgb: "0, 50, 91" }, // Dark Blue
  rakuten: { hex: "#FFE200", rgb: "255, 226, 0" }, // Yellow
};

export const GENRE_THEMES: Record<string | number, { hex: string; rgb: string }> = {
  all: { hex: "#8B5CF6", rgb: "139, 92, 246" }, // Default Purple
  28: { hex: "#EF4444", rgb: "239, 68, 68" }, // Action - Red
  12: { hex: "#EAB308", rgb: "234, 179, 8" }, // Adventure - Yellow
  16: { hex: "#0EA5E9", rgb: "14, 165, 233" }, // Animation - Sky Blue
  80: { hex: "#64748B", rgb: "100, 116, 139" }, // Crime - Slate
  35: { hex: "#F97316", rgb: "249, 115, 22" }, // Comedy - Orange
  99: { hex: "#84CC16", rgb: "132, 204, 22" }, // Documentary - Lime
  18: { hex: "#3B82F6", rgb: "59, 130, 246" }, // Drama - Blue
  10751: { hex: "#14B8A6", rgb: "20, 184, 166" }, // Family - Teal
  14: { hex: "#D946EF", rgb: "217, 70, 239" }, // Fantasy - Fuchsia
  36: { hex: "#A8A29E", rgb: "168, 162, 158" }, // History - Stone
  27: { hex: "#7F1D1D", rgb: "127, 29, 29" }, // Horror - Dark Red
  10402: { hex: "#EC4899", rgb: "236, 72, 153" }, // Music - Pink
  9648: { hex: "#7C3AED", rgb: "124, 58, 237" }, // Mystery - Violet
  10749: { hex: "#F43F5E", rgb: "244, 63, 94" }, // Romance - Rose
  878: { hex: "#06B6D4", rgb: "6, 182, 212" }, // Sci-Fi - Cyan
  53: { hex: "#B91C1C", rgb: "185, 28, 28" }, // Thriller - Red
  10752: { hex: "#4D7C0F", rgb: "77, 124, 15" }, // War - Dark Green
  37: { hex: "#D97706", rgb: "217, 119, 6" }, // Western - Amber
};

// Mood -> TMDB genre IDs, used by /api/chat when triggering TMDB Discover.
export const MOOD_TO_GENRES: Record<string, number[]> = {
  happy: [35, 10751],
  sad: [18, 10749],
  anxious: [35, 10751],
  excited: [28, 12, 878],
  romantic: [10749, 18],
  bored: [28, 53, 9648],
  scared: [27, 53],
  tired: [35, 16],
  curious: [99, 9648, 878],
  nostalgic: [18, 10749],
  angry: [28, 53],
  hopeful: [18, 12, 10751],
};
