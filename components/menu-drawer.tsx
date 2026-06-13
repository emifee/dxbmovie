"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, User, Settings, LogOut, X } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation menu opened by the ☰ hamburger. Slides in from the left
 * with a scrim. On desktop the persistent SideNav covers this role, so the
 * hamburger (and this drawer) are hidden at lg+.
 */
export function MenuDrawer() {
  const open = useUIStore((s) => s.menuOpen);
  const close = useUIStore((s) => s.closeMenu);
  const openChat = useUIStore((s) => s.openChat);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] lg:hidden">
      {/* Scrim */}
      <button
        aria-label="Close menu"
        onClick={close}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      {/* Panel */}
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border bg-surface px-5 py-6 animate-slide-in-left">
        <div className="flex items-center justify-between">
          <Link href="/" onClick={close} className="text-lg font-bold">
            <span className="text-gradient">DXBmovies</span>
            <span className="text-white">.Ai</span>
          </Link>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-6 space-y-1">
          <MenuLink href="/" active={pathname === "/"} icon={<Home size={20} />} label="Home" onClick={close} />
          <button
            onClick={() => {
              close();
              openChat();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-text-secondary transition hover:bg-surface-raised hover:text-white"
          >
            <Sparkles size={20} />
            <span className="text-sm font-medium">Chat with AI</span>
          </button>
          <MenuLink href="/profile" active={pathname === "/profile"} icon={<User size={20} />} label="Profile" onClick={close} />
        </nav>

        <div className="mt-auto space-y-1 border-t border-border pt-4">
          <MenuLink href="/profile" active={false} icon={<Settings size={20} />} label="Settings" onClick={close} />
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-red-500 transition hover:bg-surface-raised">
            <LogOut size={20} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  active,
  icon,
  label,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-3 transition",
        active
          ? "bg-surface-raised text-white"
          : "text-text-secondary hover:bg-surface-raised hover:text-white",
      )}
    >
      <span className="text-current">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
