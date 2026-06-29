"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function CardCTAButton() {
  return (
    <Link 
      href="/" 
      onClick={() => trackEvent("card_cta_clicked")}
      className="pointer-events-auto w-full max-w-sm flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-6 py-4 text-sm font-bold text-white shadow-glow transition hover:scale-105 active:scale-95"
    >
      <Sparkles size={18} />
      See your own Movie DNA — sign up free
    </Link>
  );
}
