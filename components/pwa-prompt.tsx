"use client";

import { useState, useEffect } from "react";
import { Download, X, Share } from "lucide-react";
import { cn } from "@/lib/utils";

// How long to wait before showing the prompt again if dismissed (in days)
const DISMISS_COOLDOWN_DAYS = 7;

export function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isPwa = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    setIsStandalone(isPwa);

    if (isPwa) return; // Don't show if already in app

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem("pwaPromptDismissedAt");
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < DISMISS_COOLDOWN_DAYS) {
        return; // Still in cooldown
      }
    }

    // Detect iOS (Safari)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIOSDevice);

    // If iOS, we can't use beforeinstallprompt. We just show our custom instructions.
    // Delay showing the prompt by a few seconds so it's not jarring immediately on load.
    if (isIOSDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Desktop Chrome PWA prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Small delay before showing
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    
    // Also listen for successful install
    window.addEventListener("appinstalled", () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwaPromptDismissedAt", Date.now().toString());
  };

  const handleInstall = async () => {
    if (isIOS) {
      // iOS doesn't support programmatic install. The user must use the Share menu.
      // The UI already tells them what to do, so maybe just dismiss.
      dismiss();
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowPrompt(false);
    } else {
      dismiss();
    }
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300 md:bottom-6 md:left-auto md:right-6 md:w-96">
      <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface/90 p-5 shadow-glow backdrop-blur-xl">
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-text-secondary hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-4 pr-6">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-primary text-white shadow-lg">
            <Download size={24} />
          </div>
          <div>
            <h3 className="font-bold text-white">Install DXBmovies</h3>
            <p className="text-sm text-text-secondary">
              Add to your home screen for a faster, app-like experience.
            </p>
          </div>
        </div>

        {isIOS ? (
          <div className="mt-2 rounded-xl bg-black/50 p-3 text-sm text-text-secondary">
            Tap <Share size={14} className="inline mx-1" /> and select <strong>Add to Home Screen</strong>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="mt-2 w-full rounded-xl bg-white py-3 text-sm font-bold text-black transition active:scale-[0.98]"
          >
            Add to Home Screen
          </button>
        )}
      </div>
    </div>
  );
}
