const STORAGE_KEY = "dxb:search-history";
const MAX_HISTORY = 8;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSearchQuery(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const q = query.trim();
    let history = getSearchHistory();
    // Remove if already exists so we can bump it to the top
    history = history.filter((item) => item.toLowerCase() !== q.toLowerCase());
    history.unshift(q);
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore quota errors etc.
  }
}

export function clearSearchHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
