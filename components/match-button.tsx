"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Zap } from "lucide-react";
import { MatchmakerModal } from "@/components/matchmaker-modal";

interface MatchButtonProps {
  username: string;
  hostName: string;
}

export function MatchButton({ username, hostName }: MatchButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto w-full max-w-sm flex items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary/10 backdrop-blur-md px-6 py-3.5 text-sm font-bold text-white transition hover:bg-primary/20 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
      >
        <Zap size={18} className="text-primary" />
        Find your Match % with {hostName}
      </button>

      {open && mounted && createPortal(
        <MatchmakerModal
          username={username}
          hostName={hostName}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
