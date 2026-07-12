import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** TMDB poster URL builder. Defaults to w185 for faster loading on mobile poster grids. */
export function tmdbImage(path: string | null, size = "w185") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function getTasteTitle(topGenre: string | number | null | undefined): string {
  if (topGenre === null || topGenre === undefined) return "Cinematic Explorer";
  
  let g = String(topGenre).toLowerCase();

  // If it's a TMDB genre ID, map it to the string equivalent
  const tmdbMap: Record<string, string> = {
    "28": "action",
    "12": "adventure",
    "16": "animation",
    "35": "comedy",
    "80": "crime",
    "99": "documentary",
    "18": "drama",
    "10751": "family",
    "14": "fantasy",
    "36": "history",
    "27": "horror",
    "10402": "music",
    "9648": "mystery",
    "10749": "romance",
    "878": "sci-fi",
    "53": "thriller",
  };
  
  if (tmdbMap[g]) {
    g = tmdbMap[g];
  }

  if (g.includes("horror")) return "Horror Completionist";
  if (g.includes("sci-fi") || g.includes("science fiction")) return "Sci-Fi Purist";
  if (g.includes("action")) return "Adrenaline Junkie";
  if (g.includes("romance")) return "Hopeless Romantic";
  if (g.includes("comedy")) return "Comedy Connoisseur";
  if (g.includes("thriller")) return "Thriller Addict";
  if (g.includes("drama")) return "Drama Devotee";
  if (g.includes("animation")) return "Animation Enthusiast";
  if (g.includes("documentary")) return "Truth Seeker";
  if (g.includes("fantasy")) return "Fantasy Dreamer";
  
  return "Cinematic Explorer";
}
