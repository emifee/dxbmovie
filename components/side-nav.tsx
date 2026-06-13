"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, User, PanelLeftClose, PanelLeftOpen, Clapperboard } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Persistent desktop left rail (lg+). Collapsible to an icons-only rail; the
 * collapsed state is shared via the store so page content shifts its left
 * offset in sync, and persisted to localStorage. Replaces the mobile bottom
 * nav.
 */
export function SideNav() {
  const pathname = usePathname();
  const openChat = useUIStore((s) => s.openChat);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  // Hydrate persisted preference once on mount.
  useEffect(() => {
    const saved = localStorage.getItem("dxb:sidebar-collapsed");
    if (saved !== null) setCollapsed(saved === "true");
  }, [setCollapsed]);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface/60 py-7 backdrop-blur-xl transition-[width] duration-200 lg:flex",
        collapsed ? "w-20 px-3" : "w-64 px-5",
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
        {!collapsed ? (
          <Link href="/" className="text-xl font-bold text-gradient">
            DXBmovies
          </Link>
        ) : (
          <Link href="/" aria-label="DXBmovies home" className="text-lg font-bold text-gradient">
            DXB
          </Link>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="grid h-8 w-8 place-items-center rounded-lg text-text-secondary transition hover:bg-surface-raised hover:text-white"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Expand toggle when collapsed (its own row so it stays reachable) */}
      {collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          className="mt-4 grid h-10 w-full place-items-center rounded-xl text-text-secondary transition hover:bg-surface-raised hover:text-white"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Nav */}
      <nav className={cn("space-y-1.5", collapsed ? "mt-4" : "mt-8")}>
        <SideLink href="/" active={pathname === "/"} icon={<Home size={20} />} label="Home" collapsed={collapsed} />
        <SideLink href="/reels" active={pathname === "/reels"} icon={<Clapperboard size={20} />} label="Reels" collapsed={collapsed} />
        <button
          type="button"
          onClick={() => openChat()}
          title={collapsed ? "Chat with AI" : undefined}
          className={cn(
            "flex w-full items-center rounded-xl py-3 text-left text-text-secondary transition hover:bg-surface-raised hover:text-white",
            collapsed ? "justify-center px-0" : "gap-3 px-3",
          )}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-primary">
            <Sparkles size={16} className="text-white" />
          </span>
          {!collapsed && <span className="text-sm font-medium">Chat with AI</span>}
        </button>
        <SideLink href="/profile" active={pathname === "/profile"} icon={<User size={20} />} label="Profile" collapsed={collapsed} />
      </nav>

    </aside>
  );
}

function SideLink({
  href,
  active,
  icon,
  label,
  collapsed,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-xl py-3 transition",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-surface-raised text-white shadow-glow"
          : "text-text-secondary hover:bg-surface-raised hover:text-white",
      )}
    >
      <span className="shrink-0 text-current">{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  );
}
