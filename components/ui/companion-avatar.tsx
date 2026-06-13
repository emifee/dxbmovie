"use client";

import { cn } from "@/lib/utils";
import type { AICompanionProfile } from "@/lib/types";
import { getCompanionAvatarUrl } from "@/lib/ai-companion";
import { Sparkle } from "./sparkle";

export function CompanionAvatar({
  companion,
  size = 32,
  className,
}: {
  companion?: AICompanionProfile | null;
  size?: number;
  className?: string;
}) {
  if (!companion) {
    return <Sparkle size={size} className={className} />;
  }

  const src = getCompanionAvatarUrl(companion);

  if (!src) {
    return <Sparkle size={size} className={className} />;
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-full ring-1 ring-white/10 shadow-glow",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img src={src} alt={companion.name} className="h-full w-full object-cover" />
    </div>
  );
}
