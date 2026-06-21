"use client";

import Link from "next/link";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { GoogleButton } from "@/components/login/google-button";

// Feature pills shown under the headline.
const FEATURES = ["Smart Recommendations", "Movie Details", "Personalized For You"];

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-app flex-col items-center justify-between overflow-hidden px-6 py-12">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

      {/* Top: logo + tagline */}
      <div className="z-10 text-center">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">DXBmovies</span>
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Your ultimate movie companion</p>
      </div>

      {/* Center: orb + headline */}
      <div className="z-10 flex flex-col items-center text-center">
        <GradientOrb size={160} className="mb-10 animate-orb-pulse" />
        <h2 className="max-w-xs text-3xl font-bold leading-tight text-white">
          Movies, Matched to Your Mood
        </h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
          Discover what to watch, keep track of your favorites, and explore your cinematic universe.
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {FEATURES.map((f) => (
            <span
              key={f}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom: CTA */}
      <div className="z-10 w-full">
        <GoogleButton />
        <p className="mt-4 text-center text-[11px] text-text-secondary">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
      </div>
    </main>
  );
}
