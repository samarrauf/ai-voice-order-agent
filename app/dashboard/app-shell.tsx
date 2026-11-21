"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, Plus } from "lucide-react";
import { Avatar, NAV_ICONS, Tooltip, cn } from "@/components/ui";
import { isNavActive, navFor, pageTitleFor, type NavItem } from "@/lib/nav";
import { ROLE_LABELS, type StaffRole } from "@/lib/permissions";
import { LiteSwitch } from "./lite-switch";
import { RestaurantClock } from "./restaurant-clock";

// The frame around every dashboard page: floating icon sidebar (desktop), bottom
// bar (phone/tablet) and the top bar. What the links are comes from lib/nav.ts.
// Print pages hide <header> and <nav> by CSS (print/print.css), so keep those tags.

type ShellProps = {
  restaurantName: string;
  role: StaffRole;
  username: string;
  timeZone: string;
  /** Orders still marked New: shown as a dot on the Orders icon. */
  pendingOrders: number;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
};

export function AppShell({ restaurantName, role, username, timeZone, pendingOrders, logoutAction, children }: ShellProps) {
  const pathname = usePathname();
  const onPos = pathname.startsWith("/dashboard/pos");
  const main = navFor(role, "main");
  const foot = navFor(role, "foot");
  const badges: Record<string, boolean> = { orders: pendingOrders > 0 };

  return (
    <>
      <Sidebar main={main} foot={foot} pathname={pathname} badges={badges} logoutAction={logoutAction} />
      <div className="shell-pad flex min-h-screen flex-col lg:pl-[7rem]">
        <header className="glass sticky top-0 z-30 rounded-none border-x-0 border-t-0 shadow-none">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-20 lg:pl-0">
            <div className="glass flex min-w-0 items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent"
              >
                {restaurantName.trim().charAt(0).toUpperCase()}
              </span>
              <p className="min-w-0 truncate text-sm font-bold leading-tight">
                {restaurantName}
                <span className="block truncate text-xs font-medium text-ink-faint">{pageTitleFor(pathname)}</span>
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Link
                href="/dashboard/pos"
                aria-label="New order"
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-3 text-sm font-bold text-on-accent shadow-[0_8px_24px_-8px_var(--color-accent)] transition duration-200 hover:brightness-110 active:scale-95 sm:px-5"
              >
                <Plus size={18} aria-hidden />
                <span className="hidden sm:inline">New order</span>
              </Link>
              <RestaurantClock timeZone={timeZone} className="hidden min-w-12 text-sm font-semibold tabular-nums text-ink-muted sm:inline" />
              <AvatarMenu username={username} role={role} logoutAction={logoutAction} />
            </div>
          </div>
        </header>

        {/* POS keeps its own fast layout: no entrance animation on its big tree. */}
        <main className={cn("mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12 lg:pl-0", !onPos && "stagger")}>
          {children}
        </main>
      </div>
      <BottomBar items={[...main, ...foot]} pathname={pathname} badges={badges} />
    </>
  );
}

function NavDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span aria-label="New" className="dot-pulse absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-canvas bg-accent" />;
}

function Sidebar({
  main,
  foot,
  pathname,
  badges,
  logoutAction,
}: {
  main: NavItem[];
  foot: NavItem[];
  pathname: string;
  badges: Record<string, boolean>;
  logoutAction: () => Promise<void>;
}) {
  const link = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    const Icon = NAV_ICONS[item.icon];
    return (
      <li key={item.id}>
        <Tooltip label={item.label}>
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex size-11 items-center justify-center rounded-full transition duration-200 active:scale-95",
              active ? "bg-ink text-canvas" : "text-ink-muted hover:bg-ink/10 hover:text-ink",
            )}
          >
            <Icon size={20} aria-hidden />
            <NavDot show={!!badges[item.id] && !active} />
          </Link>
        </Tooltip>
      </li>
    );
  };
  return (
    <nav
      aria-label="Sections"
      className="glass fixed bottom-4 left-4 top-4 z-40 hidden w-[4.5rem] flex-col items-center justify-between rounded-full py-4 lg:flex"
    >
      <ul className="flex flex-col items-center gap-1.5">{main.map(link)}</ul>
      <ul className="flex flex-col items-center gap-1.5">
        {foot.map(link)}
        <li>
          <form action={logoutAction}>
            <Tooltip label="Sign out">
              <button
                type="submit"
                aria-label="Sign out"
                className="flex size-11 items-center justify-center rounded-full text-ink-muted transition duration-200 hover:bg-danger/15 hover:text-danger active:scale-95"
              >
                <LogOut size={20} aria-hidden />
              </button>
            </Tooltip>
          </form>
        </li>
      </ul>
    </nav>
  );
}

/** Phone and tablet: every section in one bar along the bottom (scrolls sideways if there are many). */
function BottomBar({ items, pathname, badges }: { items: NavItem[]; pathname: string; badges: Record<string, boolean> }) {
  return (
    <nav
      aria-label="Sections"
      className="glass fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="no-scrollbar flex overflow-x-auto px-2">
        {items.map((item) => {
          const active = isNavActive(pathname, item);
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.id} className="min-w-[4.75rem] flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-200",
                  active ? "text-ink" : "text-ink-faint hover:text-ink",
                )}
              >
                <span className={cn("relative flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-200", active && "bg-ink text-canvas")}>
                  <Icon size={18} aria-hidden />
                  <NavDot show={!!badges[item.id] && !active} />
                </span>
                {item.short ?? item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AvatarMenu({ username, role, logoutAction }: { username: string; role: StaffRole; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on outside click, Escape, or when a link inside is chosen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Account menu, ${username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full transition active:scale-95"
      >
        <Avatar name={username} online />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-full z-50 mt-3 w-64 rounded-card bg-canvas p-2">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={username} online />
            <p className="min-w-0 text-sm font-bold">
              <span className="block truncate">{username}</span>
              <span className="block text-xs font-medium text-ink-faint">{ROLE_LABELS[role]}</span>
            </p>
          </div>
          <div className="my-1 h-px bg-line" />
          <LiteSwitch />
          <Link
            href="/dashboard/password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-ink/5"
          >
            <KeyRound size={16} aria-hidden className="text-ink-faint" />
            Change password
          </Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger/10">
              <LogOut size={16} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
