"use client";

import { signIn } from "next-auth/react";
import { GoogleGlyph } from "@/components/ui/google-glyph";

/**
 * "Continue with Google" CTA. Calls NextAuth's Google OAuth flow.
 * Always lands on /?onboarding=1 — the overlay checks the user's DB
 * `onboardingDone` flag and auto-dismisses for returning users.
 */
export function GoogleButton() {
  function handleClick() {
    signIn("google", { callbackUrl: "/?onboarding=1" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3.5 font-medium text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.99]"
    >
      <GoogleGlyph />
      Continue with Google
    </button>
  );
}
