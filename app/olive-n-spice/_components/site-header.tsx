"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { Menu, X } from "lucide-react";
import { cityLine, routes, site } from "@/data/sites/olive-n-spice/config";
import { Wordmark } from "./wordmark";

// The bar at the top of every page: wordmark, the three page links and a
// gold "Reserve" button that never goes away. It is see-through at the top
// of a page and turns into a frosted cream bar once you scroll.
// On phones the links move into a full-screen menu (a native <dialog>, so
// the keyboard focus stays inside it and Esc closes it).

const NAV = [
  { href: routes.menu, label: "Menu" },
  { href: routes.events, label: "Events" },
  { href: routes.reserve, label: "Reserve" },
];

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

export function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > 16,
    () => false,
  );
  const menuRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const openMenu = () => {
    menuRef.current?.showModal();
    setMenuOpen(true);
  };
  const closeMenu = () => menuRef.current?.close();

  return (
    <header className="ons-header" data-scrolled={scrolled}>
      <div className="ons-container ons-header-inner">
        <Link href={routes.home} aria-label={`${site.name}, home`} className="min-w-0 shrink">
          <Wordmark />
        </Link>

        <nav className="ons-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="ons-nav-link"
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ons-header-actions">
          <Link href={routes.reserve} className="ons-btn ons-btn-gold ons-btn-sm">
            Reserve<span className="hidden sm:inline"> a table</span>
          </Link>
          <button
            type="button"
            className="ons-menu-toggle"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={openMenu}
          >
            <Menu size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>

      <dialog
        ref={menuRef}
        className="ons-mobile-menu ons-on-dark"
        aria-label="Site menu"
        onClose={() => setMenuOpen(false)}
      >
        <div className="ons-mobile-menu-top">
          <Link href={routes.home} onClick={closeMenu} aria-label={`${site.name}, home`}>
            <Wordmark />
          </Link>
          <button type="button" className="ons-menu-toggle" aria-label="Close menu" onClick={closeMenu}>
            <X size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="ons-mobile-menu-body">
          <nav className="ons-mobile-menu-links" aria-label="Main">
            {[{ href: routes.home, label: "Home" }, ...NAV].map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="ons-mobile-menu-link"
                style={{ "--i": i } as React.CSSProperties}
                aria-current={(item.href === routes.home ? pathname === routes.home : isCurrent(item.href)) ? "page" : undefined}
              >
                <span aria-hidden>0{i + 1}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-4">
            <Link href={routes.reserve} onClick={closeMenu} className="ons-btn ons-btn-gold w-full">
              Reserve a table
            </Link>
            <p className="text-center text-sm opacity-70">
              {site.tagline} · {cityLine}
            </p>
          </div>
        </div>
      </dialog>
    </header>
  );
}
