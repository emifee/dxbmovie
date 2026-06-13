import { cn } from "@/lib/utils";

/**
 * Pure-CSS animated gradient orb (no external library). Size is driven by the
 * --orb-size CSS var so the same component renders small on the homepage card
 * and large on /login. Styling lives in globals.css (.orb).
 */
export function GradientOrb({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("orb shrink-0", className)}
      style={{ ["--orb-size" as string]: `${size}px` }}
      aria-hidden
    />
  );
}
