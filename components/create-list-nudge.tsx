"use client";

import { useState, useEffect } from "react";
import { X, ListPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/lib/store";

const NUDGE_DELAY_MS = 3000; // 3 seconds
const DISMISSED_KEY = "dxb_create_list_nudge_dismissed";

export function CreateListNudge({ listOwnerEmail }: { listOwnerEmail: string | null }) {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // If the viewer is the owner of this list, don't show the nudge.
    if (status === "authenticated" && session?.user?.email === listOwnerEmail) {
      return;
    }

    if (typeof window !== "undefined") {
      const dismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (dismissed) return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, NUDGE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [status, session, listOwnerEmail]);

  if (!visible) return null;

  function dismiss() {
    setAnimateOut(true);
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setTimeout(() => setVisible(false), 300);
  }

  function handleCreateList() {
    dismiss();
    router.push("/profile");
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
            <ListPlus size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-[15px] font-bold text-white leading-tight">
              Create your own list
            </h3>
            <p className="mt-0.5 text-[13px] text-white/70 leading-relaxed">
              Curate and share your favorite movies or TV shows with friends.
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleCreateList}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.98]"
        >
          Create List
        </button>
      </div>
    </div>
  );
}
