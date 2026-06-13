"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, Sparkles, Clapperboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/store";

const NUDGES = [
  "Wanna talk movies? 🎬",
  "I can recommend something 🍿",
  "Looking for something great?",
  "Ask me anything about films ✨",
  "I have a pick for you tonight 🌙",
  "Let's find your next binge 📺",
  "Feeling like a movie night? 🎥",
  "I know exactly what you'd love 💜",
  "Tell me your mood — I'll find it",
  "Something new dropped on Netflix 👀",
];

/**
 * Instagram-style floating pill bottom navigation.
 * Only ONE icon is colored at a time — the currently active one gets the
 * gradient pink-purple circle. All others stay dim/white.
 *
 * Navigation logic:
 *  - Home: navigates to /, closes any overlays (search/chat)
 *  - Search: if not on /, navigates to / first, then opens search overlay
 *  - Chat: opens chat drawer from anywhere
 *  - Profile: navigates to /profile, closes overlays
 */
export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const openChat = useUIStore((s) => s.openChat);
  const openSearch = useUIStore((s) => s.openSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const closeChat = useUIStore((s) => s.closeChat);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const chatOpen = useUIStore((s) => s.chatOpen);

  // Only one can be active at a time
  const isReels = pathname === "/reels" && !chatOpen;
  const isChat = chatOpen;
  const isProfile = pathname === "/profile" && !chatOpen && !searchOpen;
  const isHome = pathname === "/" && !isReels && !isChat;

  // ── Nudge bubble ──────────────────────────────────────────────────────────
  const [nudge, setNudge] = useState<string | null>(null);
  const [nudgePos, setNudgePos] = useState<{ x: number; bottom: number } | null>(null);
  const chatBtnRef = useRef<HTMLButtonElement>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNudge() {
    const el = chatBtnRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setNudgePos({
        x: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top + 10,
      });
    }
    const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)];
    setNudge(msg);
  }

  useEffect(() => {
    if (isChat) {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setNudge(null);
      return;
    }

    function scheduleNext() {
      const delay = 45_000 + Math.random() * 45_000;
      nudgeTimer.current = setTimeout(() => {
        showNudge();
        hideTimer.current = setTimeout(() => {
          setNudge(null);
          scheduleNext();
        }, 4000);
      }, delay);
    }

    // First nudge: 20–40 seconds after mount
    const firstDelay = 20_000 + Math.random() * 20_000;
    nudgeTimer.current = setTimeout(() => {
      showNudge();
      hideTimer.current = setTimeout(() => {
        setNudge(null);
        scheduleNext();
      }, 4000);
    }, firstDelay);

    return () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChat]);

  function handleHome() {
    closeSearch();
    closeChat();
    if (pathname !== "/") {
      router.push("/");
    }
  }

  function handleReels() {
    closeChat();
    closeSearch();
    if (pathname !== "/reels") {
      router.push("/reels");
    }
  }

  function handleChat() {
    closeSearch();
    openChat();
  }

  function handleProfile() {
    closeSearch();
    closeChat();
    if (pathname !== "/profile") {
      router.push("/profile");
    }
  }

  return (
    <>
      {/* Nudge bubble — fixed to exact icon position */}
      {nudge && nudgePos && (
        <div
          key={nudge}
          className="fixed z-40 animate-nudge-in pointer-events-none"
          style={{
            bottom: nudgePos.bottom,
            left: nudgePos.x,
            transform: "translateX(-50%)",
          }}
        >
          <div className="relative whitespace-nowrap rounded-2xl bg-gradient-primary px-4 py-2.5 text-xs font-semibold text-white shadow-glow">
            {nudge}
            {/* Arrow tail pointing down at the icon */}
            <svg
              className="absolute -bottom-2 left-1/2 -translate-x-1/2"
              width="14"
              height="8"
              viewBox="0 0 14 8"
              fill="none"
            >
              <path d="M7 8L0 0H14L7 8Z" fill="url(#nudge-grad)" />
              <defs>
                <linearGradient id="nudge-grad" x1="0" y1="0" x2="14" y2="0" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#EC4899" />
                  <stop offset="1" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] px-4 lg:hidden">
        <div className="flex w-full max-w-[320px] items-center justify-around rounded-[2rem] border border-white/[0.08] bg-surface-raised/70 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          {/* Home */}
          <NavButton active={isHome} onClick={handleHome} label="Home">
            <Home size={20} strokeWidth={isHome ? 2.5 : 1.8} />
          </NavButton>

          {/* Reels */}
          <NavButton active={isReels} onClick={handleReels} label="Reels">
            <Clapperboard size={20} strokeWidth={isReels ? 2.5 : 1.8} />
          </NavButton>

          {/* Chat */}
          <NavButton ref={chatBtnRef} active={isChat} onClick={handleChat} label="Chat">
            <Sparkles size={20} strokeWidth={isChat ? 2.5 : 1.8} />
          </NavButton>

          {/* Profile */}
          <NavButton active={isProfile} onClick={handleProfile} label="Profile">
            <User size={20} strokeWidth={isProfile ? 2.5 : 1.8} />
          </NavButton>
        </div>
      </nav>
    </>
  );
}

import { forwardRef } from "react";

/** Renders a gradient circle + glow when active, dim icon when not. */
function IconCircle({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="relative flex items-center justify-center">
      {active && (
        <span className="absolute inset-0 scale-[1.35] rounded-full bg-gradient-primary opacity-25 blur-lg" />
      )}
      <span
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full transition-all duration-200",
          active
            ? "bg-gradient-primary text-white shadow-glow"
            : "text-white/50 hover:text-white/80",
        )}
      >
        {children}
      </span>
    </span>
  );
}

const NavButton = forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }
>(function NavButton({ active, onClick, label, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      className="active:scale-90 transition-transform"
    >
      <IconCircle active={active}>
        {children}
      </IconCircle>
    </button>
  );
});

