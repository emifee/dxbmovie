"use client";

import { useState } from "react";
import { Star, X, Sparkles, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const LS_KEY = "dxb:feedback";

export interface FeedbackState {
  reviewDone: boolean;
  featuresDone: boolean;
  lastPrompted?: number; // unix ms — when we last showed the modal
}

export function loadFeedbackState(): FeedbackState {
  if (typeof window === "undefined") return { reviewDone: false, featuresDone: false };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { reviewDone: false, featuresDone: false, ...JSON.parse(raw) } : { reviewDone: false, featuresDone: false };
  } catch {
    return { reviewDone: false, featuresDone: false };
  }
}

function saveFeedbackState(state: FeedbackState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/** Call this right before opening the modal to stamp the prompt time. */
export function markFeedbackPrompted() {
  const current = loadFeedbackState();
  saveFeedbackState({ ...current, lastPrompted: Date.now() });
}

const FEATURE_OPTIONS = [
  "🎭 Better genre discovery",
  "📺 TV show tracking",
  "👥 Watch parties with friends",
  "🌍 More regional content (Arabic, Bollywood…)",
  "🔔 New release notifications",
  "📊 My watch stats & insights",
  "🎯 Mood-based recommendations",
  "🗓️ Watch calendar / scheduler",
];

interface Props {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: Props) {
  const [step, setStep] = useState<"review" | "features" | "done">("review");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [featureOther, setFeatureOther] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleFeature(f: string) {
    setSelectedFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  async function submitReview() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await fetch("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "review", rating, comment: reviewText.trim() }),
      });
    } catch {}
    saveFeedbackState({ reviewDone: true, featuresDone: false });
    setSubmitting(false);
    setStep("features");
  }

  async function submitFeatures() {
    setSubmitting(true);
    const features = [...selectedFeatures, ...(featureOther.trim() ? [`Other: ${featureOther.trim()}`] : [])];
    try {
      await fetch("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "features", features }),
      });
    } catch {}
    saveFeedbackState({ reviewDone: true, featuresDone: true });
    setSubmitting(false);
    setStep("done");
    setTimeout(onClose, 1600);
  }

  const starLabels = ["", "Terrible", "Not great", "It's okay", "Really good", "Love it! 🔥"];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={step === "review" ? onClose : undefined} />

      <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-surface p-6 sm:rounded-3xl sm:shadow-2xl">
        {/* Close (only on step 1) */}
        {step === "review" && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-raised hover:text-white transition"
          >
            <X size={18} />
          </button>
        )}

        {/* ── STEP 1: Review ── */}
        {step === "review" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl">🎬</span>
              <h2 className="text-lg font-bold text-white">How are you finding DXBmovies?</h2>
            </div>
            <p className="mb-6 text-sm text-text-secondary">Takes 10 seconds — helps us improve for you.</p>

            {/* Stars */}
            <div className="mb-2 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    size={36}
                    className={cn(
                      "transition-colors",
                      n <= (hovered || rating) ? "fill-amber-400 text-amber-400" : "text-text-secondary",
                    )}
                  />
                </button>
              ))}
            </div>
            <p className="mb-5 text-center text-sm font-medium text-text-secondary h-5">
              {starLabels[hovered || rating]}
            </p>

            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Anything specific? (optional)"
              rows={3}
              className="mb-5 w-full resize-none rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary/60"
            />

            <button
              onClick={submitReview}
              disabled={rating === 0 || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-sm font-semibold text-white transition disabled:opacity-40 active:scale-95"
            >
              {submitting ? "Saving…" : "Continue"}
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* ── STEP 2: Features ── */}
        {step === "features" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={20} className="text-primary" />
              <h2 className="text-lg font-bold text-white">What would you love to see?</h2>
            </div>
            <p className="mb-4 text-sm text-text-secondary">Pick as many as you like — we read every one.</p>

            <div className="mb-4 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
              {FEATURE_OPTIONS.map((f) => {
                const selected = selectedFeatures.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggleFeature(f)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      selected
                        ? "border-primary/60 bg-primary/10 text-white"
                        : "border-border bg-surface-raised text-text-secondary hover:border-border hover:text-white",
                    )}
                  >
                    <div className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition", selected ? "border-primary bg-primary" : "border-border")}>
                      {selected && <Check size={11} className="text-white" />}
                    </div>
                    {f}
                  </button>
                );
              })}
            </div>

            <input
              value={featureOther}
              onChange={(e) => setFeatureOther(e.target.value)}
              placeholder="Something else? Tell us…"
              className="mb-5 w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary/60"
            />

            <button
              onClick={submitFeatures}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-sm font-semibold text-white transition disabled:opacity-40 active:scale-95"
            >
              {submitting ? "Sending…" : "Submit feedback"}
            </button>
          </>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/20 text-primary">
              <Check size={28} />
            </div>
            <h2 className="text-lg font-bold text-white">Thank you! 🙏</h2>
            <p className="text-sm text-text-secondary">Your feedback shapes DXBmovies. We really appreciate it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
