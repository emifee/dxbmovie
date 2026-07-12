/**
 * Device ID — generates a persistent anonymous UUID on first visit.
 * Stored in both localStorage (fast reads) and a 1-year cookie
 * (survives localStorage clears and works with SSR cookies).
 */

const KEY = "dxb_device_id";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Returns the persistent device ID, creating one if this is the first visit. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  // Try localStorage first
  let id = localStorage.getItem(KEY);
  if (!id) {
    // Fall back to cookie (e.g. localStorage was cleared)
    id = getCookie(KEY);
  }
  if (!id) {
    // Brand new visitor — generate and store everywhere
    id = generateUUID();
  }

  // Always keep both in sync
  localStorage.setItem(KEY, id);
  setCookie(KEY, id, 365);

  return id;
}
