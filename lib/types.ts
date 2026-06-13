// Shared domain types used across the UI. These mirror the shapes the TMDB +
// /api routes will eventually return, so swapping mock data for live data
// later is a drop-in change.

export type MediaType = "movie" | "tv";

export interface Movie {
  id: number;
  title: string;
  year: string;
  rating: number; // 0-10 (TMDB vote_average)
  voteAverage?: number; // Raw TMDB vote_average from reels mapping
  posterPath: string | null; // TMDB path, e.g. /abc.jpg
  backdropPath?: string | null; // TMDB landscape backdrop path
  overview: string;
  genres: string[];
  cast: string[];
  trailerKey?: string; // YouTube key
  mediaType: MediaType;
  providers?: WatchProvider[]; // region-aware watch providers (TMDB per-country)
}

export interface WatchProvider {
  name: string;
  logoPath: string | null;
}

export type ChatRole = "user" | "assistant";

export type CompanionGender = "female" | "male";

export type CompanionRace =
  | "black_african"
  | "white_caucasian"
  | "asian"
  | "native_indigenous"
  | "pacific_islander"
  | "mena";

export interface AICompanionProfile {
  gender: CompanionGender;
  name: string;
  race: CompanionRace;
  avatarSeed: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  imageUrl?: string; // data URL when user attaches an image
  recommendations?: Movie[]; // present on the AI rec message
  model?: string; // kept for session storage compat, not displayed
  provider?: "groq" | "openai"; // kept for session storage compat, not displayed
  timestamp?: number; // unix ms when message was created
}

export interface Genre {
  id: number | "all";
  label: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  timeAgo: string;
}
