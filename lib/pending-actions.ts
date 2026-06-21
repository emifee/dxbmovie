import type { Movie } from "./types";

export type PendingAction =
  | { type: "add_watchlist"; movie: Movie }
  | { type: "reaction"; movieId: number; reaction: "like" | "dislike" }
  | { type: "open_chat"; text?: string; movie?: Movie | null }
  | { type: "open_detail"; movie: Movie };

const STORAGE_KEY = "dxb:pending_action";

export function setPendingAction(action: PendingAction) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  }
}

export function getAndClearPendingAction(): PendingAction | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(STORAGE_KEY);
  if (val) {
    localStorage.removeItem(STORAGE_KEY);
    try {
      return JSON.parse(val) as PendingAction;
    } catch {
      return null;
    }
  }
  return null;
}
