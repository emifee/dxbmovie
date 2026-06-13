/**
 * Full list of genres available for the Movie DNA editor.
 * These align with TMDB genre names so we can cross-reference later.
 */
export const GENRE_LIST = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
] as const;

export type GenreName = (typeof GENRE_LIST)[number];
