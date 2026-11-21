"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  MessagesSquare,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { PillTabs, cn, isActiveTab } from "@/components/ui";
import { can, type StaffRole } from "@/lib/permissions";

// The five main sections. Orders stays at /dashboard (where login lands).
const TABS = [
  { href: "/dashboard", label: "Orders", icon: ReceiptText, exact: true },
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/dashboard/conversations", label: "Conversations", short: "Calls", icon: MessagesSquare },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
];

// Smaller, less-used pages.
const SECONDARY = [
  { href: "/dashboard/tables", label: "Tables", icon: LayoutGrid },
  { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
];

/** Desktop: the pill tabs in the header. */
export function MainTabs() {
  return <PillTabs tabs={TABS} />;
}

/** Tables, Menu, Staff, Settings, Password: small text links on wide screens, icon buttons on narrow ones. */
export function SecondaryLinks({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  // Staff and Settings only show for roles that may use them (lib/permissions.ts);
  // the pages and the API refuse everyone else too. Everyone can change their own password.
  const links = [
    ...SECONDARY,
    ...(can(role, "staff_manage") ? [{ href: "/dashboard/staff", label: "Staff", icon: UserCog }] : []),
    ...(can(role, "settings_edit") ? [{ href: "/dashboard/settings", label: "Settings", icon: Settings }] : []),
    { href: "/dashboard/password", label: "Password", icon: KeyRound },
  ];
  return (
    <div className="flex items-center">
      {links.map((link) => {
        const active = isActiveTab(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-label={link.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-200",
              active ? "text-accent-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            <link.icon size={18} aria-hidden className="xl:hidden" />
            <span className="hidden xl:inline">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Phone and tablet: the same five sections as a bar fixed to the bottom of the screen. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const active = isActiveTab(pathname, tab);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-200",
                  active ? "text-accent-ink" : "text-ink-faint hover:text-ink",
                )}
              >
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                <tab.icon size={20} aria-hidden />
                {tab.short ?? tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
