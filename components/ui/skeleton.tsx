import { cn } from "@/lib/utils";

/**
 * Loading placeholder with a sweeping highlight.
 *
 * Replaces the flat `animate-pulse` + border boxes that read as broken empty
 * outlines rather than loading state. The filled base plus moving sheen is what
 * signals "content is coming".
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-white/[0.06]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}
