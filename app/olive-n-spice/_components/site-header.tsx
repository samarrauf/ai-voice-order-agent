"use client";

import { SiteLink } from "./site-link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { Menu, Phone, X } from "lucide-react";
import { cityLine, phoneHref, routes, site } from "@/data/sites/olive-n-spice/config";
import { toSitePath } from "@/lib/hosts";
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

// The call link (from config.ts). On tablets and computers it is a small round
// phone button in the bar; on phones it is a full button inside the menu.
const tel = phoneHref();

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

export function SiteHeader() {
  // On olive-n-spice.vercel.app the address bar says "/menu"; toSitePath() turns it back into "/olive-n-spice/menu".
  const pathname = toSitePath(usePathname());
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
        <SiteLink href={routes.home} aria-label={`${site.name}, home`} className="min-w-0 shrink">
          <Wordmark />
        </SiteLink>

        <nav className="ons-nav" aria-label="Main">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className="ons-nav-link"
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              {item.label}
            </SiteLink>
          ))}
        </nav>

        <div className="ons-header-actions">
          {tel && (
            <a href={tel} className="ons-header-call" aria-label={`Call ${site.contact.phone?.display}`} title={`Call ${site.contact.phone?.display}`}>
              <Phone size={18} strokeWidth={1.5} aria-hidden />
            </a>
          )}
          <SiteLink href={routes.reserve} className="ons-btn ons-btn-gold ons-btn-sm">
            Reserve<span className="hidden sm:inline"> a table</span>
          </SiteLink>
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
          <SiteLink href={routes.home} onClick={closeMenu} aria-label={`${site.name}, home`}>
            <Wordmark />
          </SiteLink>
          <button type="button" className="ons-menu-toggle" aria-label="Close menu" onClick={closeMenu}>
            <X size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="ons-mobile-menu-body">
          <nav className="ons-mobile-menu-links" aria-label="Main">
            {[{ href: routes.home, label: "Home" }, ...NAV].map((item, i) => (
              <SiteLink
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="ons-mobile-menu-link"
                style={{ "--i": i } as React.CSSProperties}
                aria-current={(item.href === routes.home ? pathname === routes.home : isCurrent(item.href)) ? "page" : undefined}
              >
                <span aria-hidden>0{i + 1}</span>
                {item.label}
              </SiteLink>
            ))}
          </nav>
          <div className="flex flex-col gap-4">
            <SiteLink href={routes.reserve} onClick={closeMenu} className="ons-btn ons-btn-gold w-full">
              Reserve a table
            </SiteLink>
            {tel && (
              <a href={tel} className="ons-btn ons-btn-ghost w-full">
                <Phone size={16} aria-hidden />
                Call {site.contact.phone?.display}
              </a>
            )}
            <p className="text-center text-sm opacity-70">
              {site.tagline} · {cityLine}
            </p>
          </div>
        </div>
      </dialog>
    </header>
  );
}
