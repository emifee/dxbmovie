"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { ThumbsUp, ThumbsDown, Volume2, Square } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { CompanionAvatar } from "@/components/ui/companion-avatar";
import { RecommendationCards } from "./recommendation-cards";
import { cn } from "@/lib/utils";
import { useAccountStore } from "@/lib/account-store";

/**
 * Gemini-style chat message. User messages: frosted glass pill on the right.
 * AI messages: flat left-aligned text with an avatar, animated loading dots,
 * action row (thumbs + speaker), and optional inline recommendation cards.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const signedIn = useAccountStore((s) => s.signedIn);
  const companion = useAccountStore((s) => s.aiCompanion);

  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const toggleFeedback = (type: "up" | "down") => {
    setFeedback((prev) => (prev === type ? null : type));
  };

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsPlaying(false);
  }

  function browserTTSFallback(text: string) {
    if (!("speechSynthesis" in window)) { setIsPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.includes("en") && (v.name.includes("Female") || v.name.includes("Samantha") || v.name.includes("Google US English")),
    );
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  }

  async function handleReadAloud() {
    if (isPlaying) { stopAudio(); return; }

    setIsPlaying(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          gender: companion?.gender ?? "female",
        }),
      });

      // 503 = key not configured → fall back to browser TTS
      if (res.status === 503) { browserTTSFallback(message.content); return; }
      if (!res.ok) throw new Error("TTS failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setIsPlaying(false); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setIsPlaying(false); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch {
      setIsPlaying(false);
      browserTTSFallback(message.content);
    }
  }

  /* ─── User message: frosted glass pill ─── */
  if (isUser) {
    return (
      <div className="flex animate-message-in flex-col items-end gap-1">
        <div className="max-w-[82%] space-y-2 rounded-3xl bg-white/[0.08] backdrop-blur-md px-5 py-3 text-sm font-medium text-white/90">
          {/* Show attached image as a visible thumbnail */}
          {message.imageUrl && (
            <div className="overflow-hidden rounded-2xl">
              <Image
                src={message.imageUrl}
                alt="Attached image"
                width={240}
                height={180}
                className="h-auto w-full max-w-[240px] rounded-2xl object-cover"
                unoptimized
              />
            </div>
          )}
          {message.content}
        </div>
        {message.timestamp && (
          <span className="pr-2 text-[10px] text-white/30">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    );
  }

  /* ─── AI message: flat text with avatar ─── */
  return (
    <div className="flex animate-message-in gap-3">
      <CompanionAvatar companion={signedIn ? companion : null} size={28} className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="max-w-[90%] text-[0.9375rem] leading-relaxed text-white/90">
          {message.content === "…" ? (
            <GeminiDots />
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>

        {message.recommendations && message.recommendations.length > 0 && (
          <RecommendationCards movies={message.recommendations} />
        )}

        {/* Action row */}
        {message.content !== "…" && (
          <div className="mt-2 flex items-center gap-3.5 pl-0.5 text-white/30">
            <ActionIcon 
              label="Good response" 
              onClick={() => toggleFeedback("up")}
              active={feedback === "up"}
            >
              <ThumbsUp size={14} className={feedback === "up" ? "fill-current" : ""} />
            </ActionIcon>
            <ActionIcon 
              label="Bad response" 
              onClick={() => toggleFeedback("down")}
              active={feedback === "down"}
            >
              <ThumbsDown size={14} className={feedback === "down" ? "fill-current" : ""} />
            </ActionIcon>
            <ActionIcon 
              label={isPlaying ? "Stop audio" : "Read aloud"} 
              onClick={handleReadAloud}
              active={isPlaying}
            >
              {isPlaying ? <Square size={12} className="fill-current" /> : <Volume2 size={14} />}
            </ActionIcon>
            {message.timestamp && (
              <span className={cn(
                "ml-auto text-[10px] font-medium",
                message.provider === "groq" ? "text-emerald-400/60" : message.provider === "openai" ? "text-sky-400/60" : "text-white/20"
              )}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Gemini-style animated loading dots ─── */
function GeminiDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-white/60 animate-gemini-dot" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-white/60 animate-gemini-dot" style={{ animationDelay: "200ms" }} />
      <span className="h-2 w-2 rounded-full bg-white/60 animate-gemini-dot" style={{ animationDelay: "400ms" }} />
    </span>
  );
}

function ActionIcon({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn("transition", active ? "text-primary" : "hover:text-white/70")}
    >
      {children}
    </button>
  );
}
