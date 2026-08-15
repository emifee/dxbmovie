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
  link?: string;
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
  audioUrl?: string; // data URL when AI sends a voice message
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

export interface UserListItem {
  id: number;
  title: string;
  posterPath: string | null;
  mediaType: "movie" | "tv";
  year: string;
  rating?: number;
}

export interface UserList {
  _id: string;
  userId: string;
  userName: string | null;
  name: string;
  slug: string;
  description?: string;
  items: UserListItem[];
  published: boolean;
  creatorOnline?: boolean; // populated at query time
  upvotes?: number;
  downvotes?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductStatus =
  | "discovered"
  | "needs_review"
  | "active"
  | "disabled"
  | "rejected"
  | "unavailable"
  | "stale";

export interface ProductVerification {
  productExists: boolean;
  destinationValid: boolean;
  imageValid: boolean;
  priceVerified: boolean;
  availabilityVerified: boolean;
  merchantVerified: boolean;
  regionVerified: boolean;
  passed: boolean;
}

export interface MovieProduct {
  _id?: any;
  id: string;
  movieId: string | number;
  title: string;
  description?: string;
  image: string;
  category: string;
  price: number | null;
  currency: string;
  originalPrice?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  
  // Fulfillment & Status
  status: ProductStatus;
  enabled: boolean;
  featured?: boolean;
  priority?: number;
  fulfillmentType?: "affiliate" | "dropship" | "owned_inventory" | "marketplace";
  availability?: "in_stock" | "out_of_stock" | "preorder";

  // Provenance & Identifiers
  provider: string; // e.g., "amazon_creators"
  merchant: string; // e.g., "Amazon"
  merchantProductId: string; // e.g., ASIN
  canonicalProductUrl?: string;
  affiliateUrl: string;
  discoveryQuery?: string;
  discoveryMethod?: string;
  sourceRegion: string;
  
  // Verification & Relevance
  relevanceScore: number;
  signals: Record<string, number>;
  penalties: Record<string, number>;
  relevanceReason: string;
  verification: ProductVerification;
  
  // Timestamps
  discoveredAt: string;
  lastFetchedAt?: string;
  lastVerifiedAt?: string;
  nextVerificationAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // Diagnostics & Raw Data
  providerSnapshot?: any;
  error?: string;
}

export interface CommerceMovieProfile {
  movieId: string | number;
  title: string;
  year: string;
  franchises: string[];
  characters: string[];
  sourceMaterial: string[];
  genres: string[];
  studios: string[];
  merchandisePotential: string[];
}

export interface ProductSearchInput {
  query: string;
  category?: string;
  region?: string;
  movieProfile: CommerceMovieProfile;
}

export interface MerchantProduct {
  merchantProductId: string;
  title: string;
  description?: string;
  image: string;
  category: string;
  price: number | null;
  currency: string;
  rating?: number | null;
  reviewCount?: number | null;
  canonicalProductUrl: string;
  affiliateUrl: string;
  merchant: string;
  availability: "in_stock" | "out_of_stock" | "preorder";
}

export interface CommerceProvider {
  searchProducts(input: ProductSearchInput): Promise<MerchantProduct[]>;
  getProduct(productId: string): Promise<MerchantProduct | null>;
  verifyProduct(productId: string): Promise<ProductVerification>;
}

export type CommerceProviderErrorCode = 
  | "AUTHENTICATION_FAILED" 
  | "RATE_LIMITED" 
  | "PROVIDER_UNAVAILABLE" 
  | "INVALID_REQUEST" 
  | "REGION_UNSUPPORTED" 
  | "PRODUCT_NOT_FOUND" 
  | "UNKNOWN";

export class CommerceProviderError extends Error {
  code: CommerceProviderErrorCode;
  provider: string;
  retryable: boolean;

  constructor(message: string, code: CommerceProviderErrorCode, provider: string, retryable: boolean) {
    super(message);
    this.name = "CommerceProviderError";
    this.code = code;
    this.provider = provider;
    this.retryable = retryable;
  }
}

export interface DiscoveryRun {
  id?: string;
  movieId: string | number;
  provider: string;
  region: string;
  queriesGenerated: string[];
  resultsReturned: number;
  resultsDeduplicated: number;
  resultsRejected: number;
  resultsNeedsReview: number;
  resultsActivated: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "success" | "failed" | "partial";
  errorCode?: string;
  errorMessage?: string;
}
