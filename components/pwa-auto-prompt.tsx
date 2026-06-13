"use client";

import { useEffect, useState } from "react";
import { X, Smartphone } from "lucide-react";

const SHOWN_KEY = "dxb:pwa-prompt-shown";
const DELAY_MS = 10 * 60 * 1000; // 10 minutes

export function PWAAutoPrompt() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    // Only show on web (not already installed as PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);

    if (isStandalone) return;

    // Only show once ever
    if (localStorage.getItem(SHOWN_KEY)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      localStorage.setItem(SHOWN_KEY, "1");
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-surface p-6 sm:rounded-3xl sm:shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-raised hover:text-white transition"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Smartphone size={22} className="text-primary" />
          <h2 className="text-lg font-bold text-white">Download DXBmovies</h2>
        </div>
        <p className="mb-5 text-sm text-text-secondary">
          Install the app on your phone. No App Store needed. Works just like a native app.
        </p>

        {/* Tab switcher */}
        <div className="mb-5 flex gap-2 rounded-xl bg-surface-raised p-1">
          {(["ios", "android"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === t ? "bg-gradient-primary text-white" : "text-text-secondary hover:text-white"
              }`}
            >
              {t === "ios" ? "iPhone / iPad" : "Android"}
            </button>
          ))}
        </div>

        {tab === "ios" && (
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">1</span>
              <p className="text-sm text-white">
                Open <span className="font-semibold">DXBmovies</span> in <span className="font-semibold">Safari</span> on your iPhone or iPad.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">2</span>
              <p className="text-sm text-white">
                Tap the <span className="font-semibold">Share</span> button{" "}
                <span className="inline-block rounded bg-surface-raised px-1.5 py-0.5 text-xs">⬆</span>{" "}
                at the bottom of the screen.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">3</span>
              <p className="text-sm text-white">
                Scroll down and tap <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">4</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">Add</span> in the top-right corner.
              </p>
            </li>
          </ol>
        )}

        {tab === "android" && (
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">1</span>
              <p className="text-sm text-white">
                Open <span className="font-semibold">DXBmovies</span> in <span className="font-semibold">Chrome</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">2</span>
              <p className="text-sm text-white">
                Tap the <span className="font-semibold">three-dot menu</span>{" "}
                <span className="inline-block rounded bg-surface-raised px-1.5 py-0.5 text-xs">⋮</span>{" "}
                in the top-right corner.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">3</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">&ldquo;Add to Home screen&rdquo;</span> or{" "}
                <span className="font-semibold">&ldquo;Install app&rdquo;</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">4</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">Install</span> to confirm.
              </p>
            </li>
          </ol>
        )}

        <button
          onClick={dismiss}
          className="mt-6 w-full rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
