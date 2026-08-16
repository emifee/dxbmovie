import clientPromise from "@/lib/mongodb";
import { fetchMediaCaption } from "./client";

export interface InstagramMediaMapping {
  instagramMediaId: string;
  movieId?: string;
  tmdbId?: number;
  movieTitle?: string;
  releaseYear?: number;
  overview?: string;
  caption?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Very basic title extractor. 
 * Looks for patterns like "In Time 2011" or "The Matrix (1999)".
 */
function extractPotentialTitleAndYear(caption: string): { title: string; year?: string } | null {
  // Try to find a title followed by a 4 digit year
  const match = caption.match(/^(.+?)\s*\(?(\d{4})\)?/m);
  if (match) {
    const title = match[1].trim().replace(/['"]/g, "");
    const year = match[2];
    if (title.length > 1 && title.length < 50) {
      return { title, year };
    }
  }
  
  // Just return the first line or up to 30 chars as a fallback guess
  const firstLine = caption.split('\n')[0].trim().substring(0, 30);
  if (firstLine.length > 2) {
    return { title: firstLine.replace(/['"]/g, "") };
  }

  return null;
}

async function searchTMDB(query: string, year?: string): Promise<any | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  try {
    let url = `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`;
    
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    // Find first valid movie or tv show
    let hit = data.results?.find((r: any) => r.media_type === "movie" || r.media_type === "tv");
    
    // If year is provided, try to match it
    if (year && data.results) {
      const yearHit = data.results.find((r: any) => {
        const rYear = (r.release_date || r.first_air_date || "").slice(0, 4);
        return rYear === year && (r.media_type === "movie" || r.media_type === "tv");
      });
      if (yearHit) hit = yearHit;
    }

    if (!hit) return null;
    
    return {
      tmdbId: hit.id,
      movieTitle: hit.title || hit.name,
      releaseYear: parseInt((hit.release_date || hit.first_air_date || "").slice(0, 4)) || undefined,
      overview: hit.overview,
    };
  } catch (err) {
    console.error("[instagram/context] TMDB search failed", err);
    return null;
  }
}

export async function resolveInstagramMediaContext(mediaId: string): Promise<InstagramMediaMapping> {
  const client = await clientPromise;
  const db = client.db("dxbmovies");
  const mappingsCol = db.collection<InstagramMediaMapping>("instagram_media_mappings");

  // 1. Query the DB cache
  const cached = await mappingsCol.findOne({ instagramMediaId: mediaId });
  if (cached) {
    console.log(`[instagram/context] Cache hit for mediaId=${mediaId}`);
    return cached;
  }

  console.log(`[instagram/context] Cache miss for mediaId=${mediaId}, hitting Graph API`);

  // 2. Fallback to Graph API
  let caption = await fetchMediaCaption(mediaId);
  if (!caption) {
    caption = "(No caption or could not fetch from Instagram)";
  }

  const mapping: InstagramMediaMapping = {
    instagramMediaId: mediaId,
    caption,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. Try to resolve movie metadata from caption
  if (caption && caption !== "(No caption or could not fetch from Instagram)") {
    const extracted = extractPotentialTitleAndYear(caption);
    if (extracted && extracted.title) {
      const tmdbData = await searchTMDB(extracted.title, extracted.year);
      if (tmdbData) {
        mapping.tmdbId = tmdbData.tmdbId;
        mapping.movieTitle = tmdbData.movieTitle;
        mapping.releaseYear = tmdbData.releaseYear;
        mapping.overview = tmdbData.overview;
      }
    }
  }

  // 4. Cache it
  try {
    await mappingsCol.insertOne(mapping);
  } catch (err) {
    console.error("[instagram/context] failed to cache mapping", err);
  }

  return mapping;
}
