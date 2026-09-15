/**
 * Brand and site identity — the single source of truth.
 *
 * This product is being rebranded from DXBmovies to WaZhop Cinema, one of the
 * three platforms WaZhop publishes alongside WaZhop Storefront and WaZhop
 * Receptionist. Before this file the brand name appeared as a literal in 207
 * places and the origin in 38, which is why the rebrand starts by giving both
 * one home rather than by editing 126 files in place.
 *
 * WHAT IS DELIBERATELY NOT REBRANDED, and why each one would break something:
 *
 *   - localStorage and cookie keys (dxb_device_id, dxb_anon_prefs,
 *     dxb_signup_source, dxb_vote_*, dxb_last_watch_click, and the several
 *     dismissed-nudge flags). These are written on visitors' devices today.
 *     Renaming them does not migrate anything — it orphans it, so every
 *     returning user looks brand new, loses their preferences, and is shown
 *     every onboarding nudge again.
 *
 *   - The Amazon affiliate tag `dxb-20`. It is an account identifier at
 *     Amazon's end, not a string we own. Changing it does not rename the
 *     account; it points the commission at a tag that does not exist.
 *
 *   - The MongoDB database name and connection string (`dxbmovies`). Renaming
 *     a database in code does not rename the database.
 *
 *   - The API route /api/movies/dxb-trending. It is an internal path, invisible
 *     to users, and renaming it is a coordinated client+server change with no
 *     benefit attached.
 *
 *   - The Instagram and Facebook handles, and hello@dxbmovie.online. These are
 *     real accounts and a real mailbox that exist outside this repository.
 *     They change when someone creates the replacements, not when we edit a
 *     string — pointing at a handle nobody owns is worse than an old handle.
 *
 * The rule the list above follows: rebrand what a reader SEES, keep what a
 * system RESOLVES.
 */

/** The product's name, as written anywhere a person will read it. */
export const BRAND_NAME = "WaZhop Cinema";

/**
 * Short form for space-constrained surfaces — the PWA home-screen label and the
 * iOS web-app title. "DXB" was the old one. Kept to the full brand rather than
 * "Cinema" on its own: an icon captioned "Cinema" says nothing about whose it
 * is, which is the entire point of the rebrand.
 */
export const BRAND_SHORT_NAME = "WaZhop Cinema";

/** The parent brand, for copy that needs to place this product within it. */
export const PARENT_BRAND = "WaZhop";

/**
 * Canonical origin. Every absolute URL — metadata, sitemap, robots, OG images,
 * share links, emails and push notifications — derives from this constant, so
 * the cutover is one edit rather than a search across the app.
 */
export const SITE_ORIGIN = "https://cinema.wazhop.com";

/**
 * Hostname without the scheme, for copy that PRINTS the address rather than
 * linking to it — "cinema.wazhop.com/card/yourname" shown under a share button.
 * Derived from SITE_ORIGIN so the two can never disagree.
 */
export const SITE_HOST = new URL(SITE_ORIGIN).host;

/**
 * The origin being retired. It stays in the codebase on purpose: it is still
 * the live domain until DNS moves, it is what existing share links and indexed
 * pages point at, and it is what the 301 redirect to SITE_ORIGIN is written
 * against. Nothing should build a NEW url from it.
 */
export const LEGACY_ORIGIN = "https://dxbmovie.online";

/**
 * Contact address. Still on the old domain because the mailbox is real and
 * receives mail; it moves when a cinema.wazhop.com equivalent exists, not
 * before. Printing an address nobody reads is worse than printing an old one.
 */
export const SUPPORT_EMAIL = "hello@dxbmovie.online";

/** Absolute URL helper, so callers never concatenate origins by hand. */
export function siteUrl(path = "/"): string {
  return new URL(path, SITE_ORIGIN).toString();
}
