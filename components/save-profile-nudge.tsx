"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { useSession, signIn } from "next-auth/react";
import { getAnonPrefs } from "@/lib/anon-prefs";

const NUDGE_KEY = "dxb_profile_nudge_dismissed";

export function SaveProfileNudge() {
  const { status } = useSession();
  const [visible, setVisible] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);

  useEffect(() => {
    // Only for unauthenticated users
    if (status === "authenticated") return;
    
    // Don't show if already dismissed
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem(NUDGE_KEY);
      if (dismissed) return;
    }

    // Wait a bit before showing to not interrupt immediate actions
    const timer = setTimeout(() => {
      if (status === "unauthenticated") {
        const prefs = getAnonPrefs();
        // Trigger condition: User has interacted with the app at least 5 times
        // This means they have built up a meaningful "taste profile"
        if (prefs.totalInteractions >= 5) {
          setVisible(true);
        }
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [status]);

  if (!visible) return null;

  function dismiss() {
    setAnimateOut(true);
    localStorage.setItem(NUDGE_KEY, "true");
    setTimeout(() => setVisible(false), 300);
  }

  function handleSaveProfile() {
    dismiss();
    localStorage.setItem("dxb_signup_source", "save_taste_profile");
    signIn("google", { callbackUrl: window.location.href });
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[86] flex justify-center px-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5.5rem))] lg:pb-6 transition-all duration-300 ${
        animateOut ? "translate-y-full opacity-0" : "animate-slide-up"
      }`}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[#D92D20]/40 bg-black/90 backdrop-blur-xl p-5 shadow-[0_-4px_30px_rgba(217,45,32,0.25)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/50 transition hover:bg-white/20 hover:text-white"
        >
          <X size={15} />
        </button>

        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#D92D20] to-[#991A1A] shadow-glow">
            <Save size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-6 pt-1">
            <h3 className="text-[16px] font-bold text-white leading-tight">
              You've got great taste.
            </h3>
            <p className="mt-1 text-[13.5px] text-white/70 leading-relaxed">
              We've been learning what you like. Sign in to save your taste profile forever before it's lost.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveProfile}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-[15px] font-bold text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.98]"
        >
          Save My Profile
        </button>
      </div>
    </div>
  );
}
