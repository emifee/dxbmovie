"use client";

import { X } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function FloatingChatPlayer() {
  const chatTrailer = useUIStore((s) => s.chatTrailer);
  const closeChatTrailer = useUIStore((s) => s.closeChatTrailer);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number }>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Reset position when a new trailer is opened
  useEffect(() => {
    if (chatTrailer) {
      setPosition({ x: 0, y: 0 });
    }
  }, [chatTrailer]);

  if (!chatTrailer) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow drag from the header area
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    // Support touch and mouse
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      currentX: position.x,
      currentY: position.y,
    };
    
    // Add document listeners
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    e.preventDefault();
    if (!isDragging) return;
    
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    
    setPosition({
      x: dragRef.current.currentX + dx,
      y: dragRef.current.currentY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerUp);
  };

  return (
    <div
      className={cn(
        "absolute z-50 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl backdrop-blur-xl transition-shadow",
        isDragging ? "shadow-glow cursor-grabbing" : "cursor-grab"
      )}
      style={{
        width: "min(340px, 90vw)",
        // Position relative to the center top of the chat area by default
        top: "70px",
        left: "50%",
        transform: `translate(calc(-50% + ${position.x}px), ${position.y}px)`,
        touchAction: "none"
      }}
      onPointerDown={handlePointerDown}
    >
      <div className="flex h-10 items-center justify-between bg-white/10 px-3 select-none">
        <p className="line-clamp-1 flex-1 pr-2 text-xs font-semibold text-white">
          {chatTrailer.title}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeChatTrailer();
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
        >
          <X size={14} />
        </button>
      </div>
      <div className="aspect-video w-full bg-black relative">
        <iframe
          src={`https://www.youtube.com/embed/${chatTrailer.key}?autoplay=1&playsinline=1&modestbranding=1&rel=0`}
          title={chatTrailer.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={cn(
            "h-full w-full border-0",
            // Disable pointer events on iframe while dragging so we don't lose the drag focus
            isDragging && "pointer-events-none"
          )}
        />
      </div>
    </div>
  );
}
