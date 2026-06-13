"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { subscribeToPush, savePushState } from "@/lib/notifications";

interface Props {
  onDismiss: () => void;
}

export function NotificationPrompt({ onDismiss }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleAllow() {
    setLoading(true);
    try {
      await subscribeToPush();
    } catch {
      // subscribeToPush handles its own errors
    } finally {
      setLoading(false);
      onDismiss();
    }
  }

  function handleDismiss() {
    savePushState({ decided: true, subscribed: false, deniedAt: Date.now() });
    onDismiss();
  }

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[80] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm animate-slide-up rounded-2xl border border-border bg-surface shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary">
            <Bell size={18} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-snug">
              Get Sonia&apos;s picks even when you&apos;re away 🎬
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Daily recommendations straight to your phone
            </p>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleAllow}
                disabled={loading}
                className="flex-1 rounded-xl bg-gradient-primary py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {loading ? "Enabling…" : "Allow Notifications"}
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-secondary transition hover:text-white active:scale-95"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-text-secondary hover:text-white transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
