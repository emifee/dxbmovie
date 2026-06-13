"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Check } from "lucide-react";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { STREAMING_SERVICES, GENRES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * First-run 3-step onboarding overlay. Shown after Google login for new users
 * (triggered by ?onboarding=1). Checks the user's `onboardingDone` flag from
 * the session — if already done, auto-dismisses. Otherwise collects streaming
 * services, 3 favorite genres, and a display name, then persists to MongoDB.
 */
export function OnboardingOverlay() {
  const router = useRouter();
  const params = useSearchParams();
  const hasParam = params.get("onboarding") === "1";
  const { data: session, status } = useSession();

  const [step, setStep] = useState(0);
  const [services, setServices] = useState<string[]>([]);
  const [genres, setGenres] = useState<(number | "all")[]>([]);
  const [name, setName] = useState("");

  // Determine if onboarding should show:
  // - URL has ?onboarding=1
  // - Session is loaded and user has NOT completed onboarding
  const sessionUser = session?.user as (typeof session)["user"] & {
    onboardingDone?: boolean;
  } | undefined;

  const shouldShow =
    hasParam &&
    status === "authenticated" &&
    sessionUser &&
    !sessionUser.onboardingDone;

  // Pre-fill name from Google profile
  useEffect(() => {
    if (sessionUser?.name && !name) {
      setName(sessionUser.name.split(" ")[0]); // First name only
    }
  }, [sessionUser?.name, name]);

  // If returning user lands on ?onboarding=1 but already completed, strip param
  useEffect(() => {
    if (
      hasParam &&
      status === "authenticated" &&
      sessionUser?.onboardingDone
    ) {
      router.replace("/");
    }
  }, [hasParam, status, sessionUser?.onboardingDone, router]);

  // Lock body scroll when overlay is visible
  useEffect(() => {
    if (shouldShow) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [shouldShow]);

  if (!shouldShow) return null;

  async function finish() {
    try {
      await fetch("/api/user/dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          streamingServices: services,
          favoriteGenres: genres,
          onboardingDone: true,
        }),
      });
    } catch (e) {
      console.error("Failed to save onboarding:", e);
    }
    router.replace("/");
  }

  const next = () => (step < 2 ? setStep(step + 1) : finish());

  const genreChoices = GENRES.filter((g) => g.id !== "all");
  const canAdvance =
    (step === 0 && services.length > 0) ||
    (step === 1 && genres.length === 3) ||
    (step === 2 && name.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[70] mx-auto flex max-w-app flex-col bg-background px-6 py-10 overflow-y-auto">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i === step ? "w-6 bg-gradient-primary" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <GradientOrb size={90} className="mb-8" />

        {step === 0 && (
          <>
            <h2 className="text-2xl font-bold text-white">
              What streaming services do you have?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              We&apos;ll only suggest things you can actually watch.
            </p>
            <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
              {STREAMING_SERVICES.map((svc) => {
                const on = services.includes(svc.slug);
                return (
                  <button
                    key={svc.slug}
                    onClick={() =>
                      setServices((p) =>
                        on ? p.filter((s) => s !== svc.slug) : [...p, svc.slug],
                      )
                    }
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm font-medium transition",
                      on
                        ? "border-primary/60 bg-surface-raised text-white shadow-glow"
                        : "border-border bg-surface text-text-secondary hover:text-white",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={svc.icon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                      {svc.label}
                    </span>
                    {on && <Check size={16} className="text-primary-pink" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-2xl font-bold text-white">Pick 3 genres you love</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {genres.length}/3 selected
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {genreChoices.map((g) => {
                const on = genres.includes(g.id);
                const full = genres.length >= 3 && !on;
                return (
                  <button
                    key={String(g.id)}
                    disabled={full}
                    onClick={() =>
                      setGenres((p) =>
                        on ? p.filter((x) => x !== g.id) : [...p, g.id],
                      )
                    }
                    className={cn(
                      "rounded-full px-4 py-2.5 text-sm font-medium transition",
                      on
                        ? "bg-gradient-primary text-white shadow-glow"
                        : full
                          ? "border border-border bg-surface text-text-secondary/40"
                          : "border border-border bg-surface text-text-secondary hover:text-white",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-bold text-white">
              What should we call you?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              DXBmovies will use this to talk to you.
            </p>
            <div className="input-glow mt-6 w-full rounded-2xl border border-border bg-surface px-4 py-3.5 transition">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-transparent text-center text-lg font-medium text-white placeholder:text-text-secondary focus:outline-none"
              />
            </div>
          </>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={next}
        disabled={!canAdvance}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition",
          canAdvance
            ? "bg-gradient-primary text-white active:scale-[0.99]"
            : "cursor-not-allowed bg-surface text-text-secondary",
        )}
      >
        {step < 2 ? "Continue" : "Start watching"}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
