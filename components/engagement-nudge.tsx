"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { GoogleGlyph } from "@/components/ui/google-glyph";

const NUDGE_DELAY_MS = 35_000; // 35 seconds
const DISMISSED_KEY = "dxb_nudge_dismissed";

/**
 * Timed engagement nudge — shows a beautiful bottom-sheet for unauthenticated
 * users after ~35 seconds of browsing. Dismissible, and remembers dismissal
 * for the session via sessionStorage.
 */
export function EngagementNudge() {
  const { status } = useSession();
  const [visible, setVisible] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);

  useEffect(() => {
    // Don't show for authenticated users
    if (status === "authenticated") return;
    // Don't show if already dismissed this session
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => {
      // Re-check auth status in case they signed in during the wait
      if (status === "unauthenticated") {
        setVisible(true);
      }
    }, NUDGE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [status]);

  if (!visible) return null;

  function dismiss() {
    setAnimateOut(true);
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setTimeout(() => setVisible(false), 300);
  }

  function handleSignIn() {
    dismiss();
    signIn("google", { callbackUrl: window.location.href });
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[85] flex justify-center px-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5.5rem))] lg:pb-6 transition-all duration-300 ${
        animateOut ? "translate-y-full opacity-0" : "animate-slide-up"
      }`}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-primary/30 bg-surface/95 backdrop-blur-xl p-5 shadow-[0_-4px_30px_rgba(var(--color-primary-rgb),0.15)]">
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:text-white"
        >
          <X size={14} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-primary shadow-glow">
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight">
              Unlock your ultimate movie companion
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Sign in to get unlimited movie talks, save your watchlist, and get picks tailored to your taste, free forever.
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleSignIn}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.98]"
        >
          <GoogleGlyph />
          Continue with Google, it takes 2 seconds
        </button>
      </div>
    </div>
  );
}
