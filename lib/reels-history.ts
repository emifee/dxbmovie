const STORAGE_KEY = "dxb:watched-reels";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface WatchedHistory {
  [videoKey: string]: number; // timestamp of when it was watched
}

function getHistory(): WatchedHistory {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function recordReelWatched(videoKey: string) {
  if (typeof window === "undefined" || !videoKey) return;
  try {
    const history = getHistory();
    history[videoKey] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Returns true if the reel has NOT been watched in the last 30 days.
 * Cleans up old entries automatically.
 */
export function isReelUnwatched(videoKey: string): boolean {
  if (typeof window === "undefined") return true; // Server-side assume unwatched
  try {
    const history = getHistory();
    const timestamp = history[videoKey];

    if (!timestamp) return true; // Never watched

    // If watched over 30 days ago, it's considered unwatched and we remove it from history
    if (Date.now() - timestamp > THIRTY_DAYS_MS) {
      delete history[videoKey];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      return true;
    }

    // Watched recently
    return false;
  } catch {
    return true; // Default to showing if error
  }
}
