"use client";

import { create } from "zustand";
import { FREE_MESSAGE_LIMIT, FREE_WINDOW_MS, pickModelTier, type ModelTier } from "./ai-config";
import type { AICompanionProfile } from "./types";

// =============================================================================
// Account + usage state for the free platform experience.
//
// Persisted to localStorage so lightweight usage state survives reloads.
// The backend remains the authoritative enforcer once wired.
// =============================================================================

const LS_KEY = "dxb:account";

interface Persisted {
  signedIn: boolean;
  email: string | null;
  freeUsed: number; // messages sent in the current 24h window
  windowStart: number; // epoch ms when the current window began
  hasSentFirst: boolean; // has the user ever sent a message?
  aiCompanion: AICompanionProfile | null;
  pushEnabled: boolean; // user has granted push notification permission
}

export interface AccountState extends Persisted {
  hydrated: boolean;
  hydrate: () => void;
  signIn: (email: string) => void;
  signOut: () => void;
  setAICompanion: (companion: AICompanionProfile) => void;
  clearAICompanion: () => void;
  setPushEnabled: (enabled: boolean) => void;
  /** Apply one message send to the rolling free window. */
  recordSend: () => void;
}

const DEFAULTS: Persisted = {
  signedIn: false,
  email: null,
  freeUsed: 0,
  windowStart: Date.now(),
  hasSentFirst: false,
  aiCompanion: null,
  pushEnabled: false,
};

function load(): Persisted {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return DEFAULTS;
  }
}

function save(state: Persisted) {
  if (typeof window === "undefined") return;
  const { signedIn, email, freeUsed, windowStart, hasSentFirst, aiCompanion, pushEnabled } = state;
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ signedIn, email, freeUsed, windowStart, hasSentFirst, aiCompanion, pushEnabled }),
  );
}

/** Roll the usage window forward if 24h have elapsed. Returns adjusted fields. */
function rolledWindow(p: Persisted): Pick<Persisted, "freeUsed" | "windowStart"> {
  if (Date.now() - p.windowStart >= FREE_WINDOW_MS) {
    return { freeUsed: 0, windowStart: Date.now() };
  }
  return { freeUsed: p.freeUsed, windowStart: p.windowStart };
}

export const useAccountStore = create<AccountState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: () => {
    const loaded = load();
    const rolled = { ...loaded, ...rolledWindow(loaded) };
    save(rolled);
    set({ ...rolled, hydrated: true });
  },

  signIn: (email) => {
    set({ signedIn: true, email });
    save(get());
  },

  signOut: () => {
    set({ signedIn: false, email: null });
    save(get());
  },

  setAICompanion: (companion) => {
    set({ aiCompanion: companion });
    save(get());
  },

  clearAICompanion: () => {
    set({ aiCompanion: null });
    save(get());
  },

  setPushEnabled: (enabled) => {
    set({ pushEnabled: enabled });
    save(get());
  },

  recordSend: () => {
    const s = get();
    const rolled = rolledWindow(s);
    set({ ...rolled, freeUsed: rolled.freeUsed + 1, hasSentFirst: true });
    save(get());
  },
}));

// ---- Selectors / derived helpers (pure, computed from a state snapshot) -----

export interface UsageView {
  tier: ModelTier;
  freeLeft: number;
  /** A free (non-credit) message is currently blocked by the 24h limit. */
  freeBlocked: boolean;
  /** Hours until the free window resets. */
  resetInHours: number;
}

export function selectUsage(s: AccountState): UsageView {
  const rolled = rolledWindow(s);
  const tier = pickModelTier(s.hasSentFirst);
  const freeLeft = Math.max(0, FREE_MESSAGE_LIMIT - rolled.freeUsed);
  const msLeft = FREE_WINDOW_MS - (Date.now() - rolled.windowStart);
  return {
    tier,
    freeLeft,
    freeBlocked: freeLeft <= 0,
    resetInHours: Math.max(0, Math.ceil(msLeft / (60 * 60 * 1000))),
  };
}

/** Should the Gmail sign-in gate block this send? Gate after 3 free guest messages. */
export function shouldGateAuth(s: AccountState): boolean {
  if (s.signedIn) return false;
  return s.freeUsed >= 3;
}
