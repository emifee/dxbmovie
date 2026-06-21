"use client";

import { useEffect, useState } from "react";
import { Mic, ArrowUp } from "lucide-react";
import { TypingText } from "@/components/ui/typing-text";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const PROMPTS = [
  "What would you like to watch today...?",
  "Have you seen the latest movie..?",
  "What movie are you watching right now..?",
  "You want to check out the latest show?",
  "In the mood for something new tonight?",
  "Need the perfect film for the weekend?",
  "Want a recommendation just for you?",
  "Feeling happy, sad, or thrilled today?",
  "Looking for a hidden gem to watch?",
  "Who are you watching with tonight?",
  "Tell me what you feel like watching",
  "Should we find your next favorite movie?",
];

export function FloatingChatOrb() {
  const [isVisible, setIsVisible] = useState(false);
  const openChat = useUIStore((s) => s.openChat);
  const chatOpen = useUIStore((s) => s.chatOpen);

  useEffect(() => {
    const handleScroll = () => {
      // The main ChatEntryCard is near the top. Once we scroll past 200px, show the orb.
      if (window.scrollY > 200) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial position
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (chatOpen) return null;

  return (
    <div
      className={cn(
        "fixed top-4 left-1/2 z-[60] flex -translate-x-1/2 transition-all duration-500 ease-out lg:top-6",
        isVisible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-12 scale-95 opacity-0"
      )}
    >
      <button
        onClick={() => openChat()}
        className="group relative flex items-center gap-2.5 rounded-full border border-primary/40 bg-black/50 p-1.5 pr-4 shadow-glow backdrop-blur-xl transition hover:border-primary/80 hover:shadow-glow-lg"
      >
        {/* The mini speaking ball */}
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-primary shadow-glow transition-transform duration-300 group-hover:scale-110">
          <Mic size={14} className="text-white drop-shadow-md" />
        </div>

        {/* Typing text area */}
        <div className="flex flex-col items-start overflow-hidden whitespace-nowrap">
          <p className="max-w-[180px] truncate font-medium text-white/90 lg:max-w-[280px]">
            <TypingText
              phrases={PROMPTS}
              className="!justify-start text-xs"
              typingSpeed={70}
            />
          </p>
        </div>
      </button>
    </div>
  );
}
