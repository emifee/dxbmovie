/**
 * Profile cover colour themes.
 *
 * Persisted server-side on the user document (see /api/user/profile), so the
 * choice follows the user to any device — the cover only renders for signed-in
 * users, so there's no anonymous case to fall back to.
 *
 * Only the *id* is ever stored or accepted over the wire; the class strings
 * live here and are resolved by id. A client must never be able to hand us an
 * arbitrary string that gets rendered as a CSS class.
 */

export interface CoverTheme {
  id: string;
  label: string;
  /** Tailwind gradient classes applied to the cover band. */
  className: string;
}

/** Brand violet→pink leads; the rest are cinematic washes that sit well on #0A0A0A. */
export const COVER_THEMES: CoverTheme[] = [
  { id: "brand", label: "Brand", className: "bg-gradient-primary" },
  { id: "ember", label: "Ember", className: "bg-gradient-to-br from-orange-500 via-red-500 to-rose-600" },
  { id: "ocean", label: "Ocean", className: "bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700" },
  { id: "forest", label: "Forest", className: "bg-gradient-to-br from-emerald-400 via-teal-600 to-green-700" },
  { id: "gold", label: "Gold", className: "bg-gradient-to-br from-amber-300 via-orange-500 to-yellow-600" },
  { id: "mono", label: "Mono", className: "bg-gradient-to-br from-zinc-400 via-zinc-600 to-zinc-800" },
];

export const DEFAULT_COVER_THEME = COVER_THEMES[0];

/** Whitelist used to validate anything arriving from a client. */
export const COVER_THEME_IDS: string[] = COVER_THEMES.map((t) => t.id);

/** Map a stored id back to a theme, falling back to the default. */
export function resolveCoverTheme(id?: string | null): CoverTheme {
  return COVER_THEMES.find((t) => t.id === id) ?? DEFAULT_COVER_THEME;
}
