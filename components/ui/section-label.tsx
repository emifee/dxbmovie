import { cn } from "@/lib/utils";

/**
 * The single section-heading treatment for the app.
 *
 * Replaces five divergent variants that had drifted apart across surfaces
 * (tracking-wider/-widest, text-white/40 vs text-white/50 vs text-text-secondary,
 * 10px/11px/12px/14px). Everything reads as one system now — if a heading needs
 * to change, it changes here.
 *
 * `accent` draws the brand gradient bar; drop it inside dense forms (filter /
 * list editor) where a bar per field would be noise.
 */
export function SectionLabel({
  children,
  accent = true,
  className,
}: {
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {accent && <span className="h-3 w-[3px] shrink-0 rounded-full bg-gradient-primary" />}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {children}
      </p>
    </div>
  );
}
