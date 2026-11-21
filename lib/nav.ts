// THE one place that lists the dashboard's navigation. Later stages add a page by
// adding ONE line to NAV_ITEMS. Only routes that exist today are listed.
// Role filtering goes through can() (lib/permissions.ts); nothing here checks a role name.
//
// Pure module: no React and no server imports. The icon is a NAME (see
// components/ui/icons.tsx, ICONS); the shell turns it into the real icon.

import { can, type Capability, type StaffRole } from "@/lib/permissions";

export type NavIconName =
  | "home"
  | "orders"
  | "overview"
  | "bookings"
  | "calls"
  | "customers"
  | "tables"
  | "menu"
  | "staff"
  | "settings"
  | "password";

export type NavItem = {
  /** Stable id (also the key for badges, e.g. the pending-orders dot). */
  id: string;
  label: string;
  /** Short label for the phone bottom bar. */
  short?: string;
  icon: NavIconName;
  href: string;
  /** Active only on this exact path (the section root). */
  exact?: boolean;
  /** Needed capability; omit = every logged-in role. */
  capability?: Capability;
  /** "main" = top of the sidebar, "foot" = bottom group (next to Sign out). */
  group: "main" | "foot";
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "Home", icon: "home", href: "/dashboard", exact: true, group: "main" },
  { id: "orders", label: "Orders", icon: "orders", href: "/dashboard/orders", group: "main" },
  { id: "overview", label: "Overview", icon: "overview", href: "/dashboard/overview", group: "main" },
  { id: "bookings", label: "Bookings", icon: "bookings", href: "/dashboard/bookings", group: "main" },
  { id: "calls", label: "Conversations", short: "Calls", icon: "calls", href: "/dashboard/conversations", group: "main" },
  { id: "customers", label: "Customers", icon: "customers", href: "/dashboard/customers", group: "main" },
  { id: "tables", label: "Tables", icon: "tables", href: "/dashboard/tables", group: "main" },
  { id: "menu", label: "Menu", icon: "menu", href: "/dashboard/menu", capability: "menu_edit", group: "main" },
  { id: "staff", label: "Staff", icon: "staff", href: "/dashboard/staff", capability: "staff_manage", group: "foot" },
  { id: "settings", label: "Settings", icon: "settings", href: "/dashboard/settings", capability: "settings_edit", group: "foot" },
];

/** Items this role may open, in order. */
export function navFor(role: StaffRole | null | undefined, group?: NavItem["group"]): NavItem[] {
  return NAV_ITEMS.filter((item) => (!group || item.group === group) && (!item.capability || can(role, item.capability)));
}

/** True when `pathname` belongs to `item`. */
export function isNavActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Page name for the top bar: the active item's label, or a fallback (POS, Password...). */
export function pageTitleFor(pathname: string): string {
  if (pathname.startsWith("/dashboard/pos")) return "New order";
  if (pathname.startsWith("/dashboard/password")) return "Password";
  if (pathname.startsWith("/dashboard/stats")) return "Stats";
  const hit = [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isNavActive(pathname, i));
  return hit?.label ?? "Dashboard";
}
