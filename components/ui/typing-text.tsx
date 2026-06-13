"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Typewriter that cycles through phrases like an AI composing a message.
 *
 * Visual: two gradient "balls" bracket the text. With the row centred, an empty
 * phrase leaves the two balls together in the middle; as characters type in,
 * the growing text pushes the left ball left and the right ball right — opening
 * space for the words. While clearing, the text shrinks and the balls come back
 * together. The text itself vibrates subtly while it's actively changing.
 *
 * Haptic: triggers a very light vibration pulse on each typed character when
 * the Vibration API is available (mobile devices).
 *
 * Balls are sized in `em`, so they scale with the heading's font-size and look
 * identical on mobile and desktop. Respects prefers-reduced-motion.
 */
export function TypingText({
  phrases,
  className,
  typingSpeed = 90,
  deletingSpeed = 45,
  holdAfterType = 2200,
  holdAfterDelete = 600,
}: {
  phrases: string[];
  className?: string;
  typingSpeed?: number;
  deletingSpeed?: number;
  holdAfterType?: number;
  holdAfterDelete?: number;
}) {
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  const [reduced, setReduced] = useState(false);
  const prevLength = useRef(0);

  // Honor reduced-motion: show the first phrase and stop.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) setText(phrases[0] ?? "");
  }, [phrases]);

  useEffect(() => {
    if (reduced || phrases.length === 0) return;

    const current = phrases[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < current.length) {
        timeout = setTimeout(
          () => setText(current.slice(0, text.length + 1)),
          typingSpeed,
        );
      } else {
        timeout = setTimeout(() => setPhase("deleting"), holdAfterType);
      }
    } else if (text.length > 0) {
      timeout = setTimeout(
        () => setText(current.slice(0, text.length - 1)),
        deletingSpeed,
      );
    } else {
      timeout = setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setPhase("typing");
      }, holdAfterDelete);
    }

    return () => clearTimeout(timeout);
  }, [
    text,
    phase,
    phraseIndex,
    phrases,
    reduced,
    typingSpeed,
    deletingSpeed,
    holdAfterType,
    holdAfterDelete,
  ]);

  // Haptic vibration on each typed character (typing phase only).
  useEffect(() => {
    if (reduced) return;
    if (phase === "typing" && text.length > prevLength.current) {
      try {
        navigator?.vibrate?.(8);
      } catch {
        // Vibration API not available — no-op.
      }
    }
    prevLength.current = text.length;
  }, [text, phase, reduced]);

  const current = phrases[phraseIndex] ?? "";
  const isChanging =
    !reduced &&
    ((phase === "typing" && text.length < current.length) ||
      (phase === "deleting" && text.length > 0));

  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <Ball />
      <span
        className={cn(
          "transition-[margin] duration-150",
          text.length ? "mx-3" : "mx-0",
          isChanging && "animate-text-vibrate",
        )}
      >
        {text}
      </span>
      <Ball delay="0.55s" />
    </span>
  );
}

/** Gradient ball, em-sized so it scales with the surrounding text. */
function Ball({ delay }: { delay?: string }) {
  return (
    <span
      aria-hidden
      style={delay ? { animationDelay: delay } : undefined}
      className="inline-block h-[0.78em] w-[0.78em] shrink-0 animate-ball-pulse rounded-full bg-gradient-primary align-middle shadow-glow"
    />
  );
}
