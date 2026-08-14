"use client";

import { useRouter, usePathname } from "next/navigation";
import { forwardRef, useRef } from "react";
import { Home, Sparkles, Clapperboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/store";

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

  const chatBtnRef = useRef<HTMLButtonElement>(null);

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
      <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] px-4 lg:hidden">
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

