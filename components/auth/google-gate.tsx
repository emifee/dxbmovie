"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { signIn } from "next-auth/react";
import { useUIStore } from "@/lib/store";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { GoogleGlyph } from "@/components/ui/google-glyph";

/**
 * Gmail-only sign-in gate. Shown after the anonymous user's first AI reply,
 * when they try to send a second message. Registration is restricted to
 * Google / Gmail accounts.
 *
 * UI build: "Continue with Google" signs in a mock Gmail session. The real
 * build swaps this for supabase.auth.signInWithOAuth({ provider: "google" })
 * with the hosted domain restricted to gmail.com.
 */
export function GoogleGate() {
  const open = useUIStore((s) => s.authGateOpen);
  const close = useUIStore((s) => s.closeAuthGate);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  function handleContinue() {
    // Trigger Google OAuth. AccountHydrator watches the session and will flip
    // `signedIn` in the store, which causes the chat drawer to auto-send the
    // pending message that triggered this gate.
    close();
    signIn("google", { callbackUrl: window.location.href });
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div className="relative mx-auto w-full max-w-app animate-slide-up rounded-t-3xl border border-border bg-surface p-6 text-center sm:rounded-3xl sm:animate-fade-in">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-text-secondary transition hover:text-white"
        >
          <X size={18} />
        </button>

        <GradientOrb size={72} className="mx-auto mb-5" />

        <h2 className="text-xl font-bold text-white">Continue the conversation</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">
          Create your free account to keep chatting with DXB, save your taste,
          and pick up right where you left off.
        </p>

        <button
          type="button"
          onClick={handleContinue}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3.5 font-medium text-black transition duration-200 hover:shadow-glow-lg active:scale-[0.99]"
        >
          <GoogleGlyph />
          Continue with Google
        </button>


      </div>
    </div>
  );
}
