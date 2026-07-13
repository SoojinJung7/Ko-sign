"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FilePlus,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/ui";
import { Logo } from "./Logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents/new", label: "New envelope", icon: FilePlus },
];

export interface NavUser {
  name: string | null;
  email: string;
}

export interface NavProps {
  user: NavUser;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/documents/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The authenticated shell's navigation chrome. Client component so it can
 * highlight the active route (`usePathname`), drive the mobile drawer, and
 * POST the logout request. Renders a fixed desktop sidebar plus a mobile
 * top bar + slide-in drawer.
 */
export function Nav({ user }: NavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — we redirect regardless so the client state is cleared.
    }
    window.location.href = "/";
  }

  const links = (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon
              size={18}
              strokeWidth={2}
              className={cn(
                "shrink-0",
                active
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-3 px-1">
        <div
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
          aria-hidden
        >
          {(user.name?.trim()?.[0] ?? user.email[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0">
          {user.name && (
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <LogOut size={18} strokeWidth={2} className="shrink-0" aria-hidden />
        {loggingOut ? "Signing out…" : "Log out"}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface px-4 py-5 lg:flex">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo size={26} className="text-base" />
        </Link>
        {links}
        <div className="mt-auto">{userBlock}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Link
          href="/dashboard"
          className="flex items-center rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo size={24} className="text-[0.95rem]" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu size={20} aria-hidden />
        </button>
      </header>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface px-4 py-5 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <Logo size={26} className="text-base" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            {links}
            <div className="mt-auto">{userBlock}</div>
          </div>
        </div>
      )}
    </>
  );
}
