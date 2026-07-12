"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { useUIStore } from "@/lib/store";

const NUDGE_DELAY_MS = 2000; // 2 seconds
const DISMISSED_KEY = "dxb_guest_cta_dismissed";

/**
 * Sticky Guest AI Trial CTA — shows a beautiful bottom banner for unauthenticated
 * users inviting them to try the AI. Dismissible for the session.
 */
export function EngagementNudge() {
  const { status } = useSession();
  const [visible, setVisible] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);
  const openChat = useUIStore((s) => s.openChat);

  useEffect(() => {
    // Don't show for authenticated users
    if (status === "authenticated") return;
    
    // Don't show if dismissed in this session
    if (typeof window !== "undefined") {
      const dismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (dismissed) return;
    }

    const timer = setTimeout(() => {
      if (status === "unauthenticated") {
        setVisible(true);
      }
    }, NUDGE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [status]);

  if (!visible) return null;

  function dismiss() {
    setAnimateOut(true);
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setTimeout(() => setVisible(false), 300);
  }

  function handleTrySonia() {
    dismiss();
    openChat();
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[85] flex justify-center px-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5.5rem))] lg:pb-6 transition-all duration-300 ${
        animateOut ? "translate-y-full opacity-0" : "animate-slide-up"
      }`}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-primary/40 bg-black/80 backdrop-blur-xl p-4 shadow-[0_-4px_30px_rgba(var(--color-primary-rgb),0.3)]">
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/50 transition hover:bg-white/20 hover:text-white"
        >
          <X size={14} />
        </button>

        {/* Content */}
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-primary shadow-glow animate-pulse-glow">
            <Sparkles size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-[15px] font-bold text-white leading-tight">
              Not sure what to watch?
            </h3>
            <p className="mt-0.5 text-[13px] text-white/70 leading-relaxed">
              Ask our AI for a personalized movie pick.
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleTrySonia}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.98]"
        >
          Try Recommendation
        </button>
      </div>
    </div>
  );
}

