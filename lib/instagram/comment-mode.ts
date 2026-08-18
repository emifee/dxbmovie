/**
 * Public Instagram comment automation mode.
 *
 * Public replies are paused: comment quality/context handling is not ready for
 * autonomous posting on a public account (a real comment about religion and
 * relationships received an unrelated movie recommendation).
 *
 * The feature is NOT removed — only gated — so it can be redesigned later.
 *
 *   off    — ingest, persist and log comments, but never schedule or publish a reply
 *   shadow — generate a reply and record it for review, never publish
 *   live   — publish replies publicly
 *
 * Fails closed: anything unrecognised, unset, or empty is treated as "off".
 */
export type CommentMode = "off" | "shadow" | "live";

export function getCommentMode(): CommentMode {
  const raw = (process.env.SONIA_COMMENT_MODE || "").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "shadow") return "shadow";
  return "off";
}

/** True only when public replies are explicitly enabled. */
export function publicRepliesEnabled(): boolean {
  return getCommentMode() === "live";
}
