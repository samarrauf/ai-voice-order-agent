"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/stats", label: "Stats" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-accent-contrast text-accent" : "text-accent-contrast/80 hover:bg-white/10"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
