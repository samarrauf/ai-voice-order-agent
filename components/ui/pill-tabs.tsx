"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

export type PillTab = { href: string; label: string; exact?: boolean };

/** True when `pathname` belongs to this tab. `exact` is for the tab that lives at the section root. */
export function isActiveTab(pathname: string, tab: PillTab): boolean {
  return tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/** Page tabs in one rounded "pill" strip. Each tab is a link to its own route. */
export function PillTabs({ tabs, className }: { tabs: PillTab[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className={cn("no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-raised p-1", className)}
    >
      {tabs.map((tab) => {
        const active = isActiveTab(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-200",
              active ? "bg-accent text-on-accent" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
