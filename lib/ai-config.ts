// =============================================================================
// AI model routing + free usage rules — single source of truth.
//
// Per-message model selection:
//   • A user's FIRST message ever → ADVANCED model.
//   • Every message after that     → CHEAP model.
//
// Free usage tracking:
//   • 1 message sent = 1 count.
//   • FREE_MESSAGE_LIMIT messages per rolling 24h window.
//   • The window resets FREE_WINDOW_MS after it started; if the user never
//     signs in they simply wait out the window.
//
// NOTE: these constants are also the contract the BACKEND must enforce
// authoritatively (/api/chat). The client copy here drives the UI/UX and an
// optimistic demo, but a client-only limit is bypassable.
// =============================================================================

export const FREE_MESSAGE_LIMIT = 5;
export const FREE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ModelTier = "advanced" | "cheap";

export interface ModelInfo {
  tier: ModelTier;
  /** Underlying provider model id used by the backend. */
  id: string;
  /** Short label shown in the UI. */
  label: string;
  provider: "anthropic" | "google";
}

export const MODELS: Record<ModelTier, ModelInfo> = {
  advanced: {
    tier: "advanced",
    id: "gemini-2.0-flash",
    label: "DXB Advanced",
    provider: "google",
  },
  cheap: {
    tier: "cheap",
    id: "gemini-2.0-flash-lite",
    label: "DXB Fast",
    provider: "google",
  },
};

/**
 * Decide which model tier a message should use.
 * @param hasSentFirstMessage  has the user ever sent a message before?
 */
export function pickModelTier(hasSentFirstMessage: boolean): ModelTier {
  if (!hasSentFirstMessage) return "advanced"; // welcome message
  return "cheap";
}
