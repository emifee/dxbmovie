"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible profile section with a chevron affordance.
 *
 * The whole header is the toggle (not just the chevron) so it's an easy target
 * on mobile. `count` renders a muted tally next to the title, which lets a
 * collapsed section still tell you whether it has anything in it.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  count,
  action,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("mt-6", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group -my-1 flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <h2 className="text-base font-bold text-white">{title}</h2>
          {typeof count === "number" && count > 0 && (
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
              {count}
            </span>
          )}
          <ChevronDown
            size={18}
            className={cn(
              "shrink-0 text-text-secondary transition-transform duration-200 group-hover:text-white",
              open && "rotate-180"
            )}
          />
        </button>
        {open && action}
      </div>
      {open && <div className="animate-fade-in">{children}</div>}
    </section>
  );
}
