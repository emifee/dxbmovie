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
 * One chat message. User messages: right-aligned gradient bubble with optional
 * image thumbnail. AI messages: left-aligned dark bubble with a sparkle avatar,
 * an action row (thumbs + speaker) and optional inline recommendation cards.
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

  if (isUser) {
    return (
      <div className="flex animate-message-in flex-col items-end gap-0.5">
        <div className="max-w-[80%] space-y-2 rounded-2xl rounded-br-md bg-gradient-primary px-4 py-2.5 text-sm font-medium text-white">
          {/* Show attached image as a visible thumbnail */}
          {message.imageUrl && (
            <div className="overflow-hidden rounded-xl">
              <Image
                src={message.imageUrl}
                alt="Attached image"
                width={240}
                height={180}
                className="h-auto w-full max-w-[240px] rounded-xl object-cover"
                unoptimized
              />
            </div>
          )}
          {message.content}
        </div>
        {message.timestamp && (
          <span className="pr-1 text-[10px] text-text-secondary/60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex animate-message-in gap-2.5">
      <CompanionAvatar companion={signedIn ? companion : null} size={28} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-surface-bubble px-4 py-2.5 text-sm font-medium text-white">
          {message.content === "…" ? (
            <span className="flex items-center gap-1">
              <span className="animate-bounce delay-0">●</span>
              <span className="animate-bounce delay-150">●</span>
              <span className="animate-bounce delay-300">●</span>
            </span>
          ) : (
            message.content
          )}
        </div>

        {message.recommendations && message.recommendations.length > 0 && (
          <RecommendationCards movies={message.recommendations} />
        )}

        {/* Action row */}
        <div className="mt-1.5 flex items-center gap-3 pl-1 text-text-secondary">
          <ActionIcon 
            label="Good response" 
            onClick={() => toggleFeedback("up")}
            active={feedback === "up"}
          >
            <ThumbsUp size={15} className={feedback === "up" ? "fill-current" : ""} />
          </ActionIcon>
          <ActionIcon 
            label="Bad response" 
            onClick={() => toggleFeedback("down")}
            active={feedback === "down"}
          >
            <ThumbsDown size={15} className={feedback === "down" ? "fill-current" : ""} />
          </ActionIcon>
          <ActionIcon 
            label={isPlaying ? "Stop audio" : "Read aloud"} 
            onClick={handleReadAloud}
            active={isPlaying}
          >
            {isPlaying ? <Square size={13} className="fill-current" /> : <Volume2 size={15} />}
          </ActionIcon>
          {message.timestamp && (
            <span className={cn(
              "ml-auto text-[10px] font-medium",
              message.provider === "groq" ? "text-emerald-400/80" : message.provider === "openai" ? "text-sky-400/80" : "text-text-secondary/60"
            )}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </div>
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
      className={cn("transition", active ? "text-primary" : "hover:text-white")}
    >
      {children}
    </button>
  );
}
