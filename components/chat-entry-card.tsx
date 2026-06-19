"use client";

import { Mic, ArrowUp } from "lucide-react";
import { TypingText } from "@/components/ui/typing-text";
import { useUIStore } from "@/lib/store";

// Cycles in the entry card so it reads like the AI is actively thinking up
// ways to start a conversation.
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

/**
 * Google-style search widget card. Big elevated rounded surface with a
 * prominent pill search bar. The typing animation acts as dynamic header text
 * above the input. Clean shadows, no glowing borders — feels premium and
 * native like Google's mobile widget.
 */
export function ChatEntryCard() {
  const openChat = useUIStore((s) => s.openChat);

  return (
    <button
      type="button"
      onClick={() => openChat()}
      className="group flex w-full flex-col gap-5 rounded-3xl bg-black/50 backdrop-blur-md p-5 text-left border border-primary/40 shadow-glow animate-pulse-glow transition duration-200 hover:border-primary/70 hover:shadow-glow-lg lg:p-7"
    >
      {/* AI prompt — big, bold, hero-sized typing text */}
      <p className="flex min-h-[2.4em] items-center justify-center px-2 text-center text-2xl font-bold leading-tight text-white lg:text-4xl">
        <TypingText phrases={PROMPTS} className="max-w-full" />
      </p>

      {/* Google-style search bar — big rounded pill, elevated, with icons */}
      <div className="flex items-center gap-3 rounded-full bg-black/30 backdrop-blur-md border border-white/5 px-5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.3)]">
        <span className="flex-1 truncate text-base text-text-secondary">
          Ask DXB...
        </span>
        <span className="grid h-9 w-9 place-items-center text-text-secondary transition group-hover:text-white">
          <Mic size={20} />
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-white shadow-glow transition group-hover:shadow-glow-lg">
          <ArrowUp size={18} />
        </span>
      </div>
    </button>
  );
}
