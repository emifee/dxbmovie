import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gradient sparkle avatar used for the AI identity (chat header, AI message
 * avatars, conversation list rows). A gradient-filled rounded square with a
 * white sparkle glyph.
 */
export function Sparkle({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full bg-gradient-primary shadow-glow",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Sparkles size={size * 0.55} className="text-white" strokeWidth={2.2} />
    </div>
  );
}
