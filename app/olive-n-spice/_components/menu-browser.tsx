"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { heroSlides } from "@/data/sites/olive-n-spice/hero";
import { formatRs, menu, type MenuCategory, type MenuItem } from "@/data/sites/olive-n-spice/menu";
import { FoodArt } from "./food-art";
import { ChefMark, SpiceMark } from "./ornaments";

// =====================================================================
// The full menu, with a bar that stays at the top while you scroll:
//   - category tabs (tap one to jump to it; the tab for the section you
//     are reading lights up by itself)
//   - a search box that filters dishes as you type
// Every dish is in the page's HTML from the server, so search engines can
// read the whole menu; the search only hides rows in the browser.
// Each group and category has an #anchor (its `id` from menu.ts), which is
// what the hero's "View full menu" links point to.
// =====================================================================

/** Lower-case, accents removed ("Jalapeño" -> "jalapeno"), so search is forgiving. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matches(item: MenuItem, category: MenuCategory, groupName: string, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = normalise(`${item.name} ${item.description ?? ""} ${category.name} ${groupName} ${item.serving ?? ""}`);
  return words.every((word) => haystack.includes(word));
}

/** The middle illustration of each group's hero slide, reused beside the group title. */
const GROUP_ART = new Map(heroSlides.map((slide) => [slide.groupId, slide.art[1]]));

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MenuBrowser() {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeId, setActiveId] = useState(menu[0].categories[0].id);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLElement>(null);

  const words = useMemo(() => normalise(query).split(/\s+/).filter(Boolean), [query]);
  const searching = words.length > 0;

  // The menu after filtering: groups and categories with no matching dish drop out.
  const visible = useMemo(
    () =>
      menu
        .map((group) => ({
          group,
          categories: group.categories
            .map((category) => ({ category, items: category.items.filter((item) => matches(item, category, group.name, words)) }))
            .filter((entry) => entry.items.length > 0),
        }))
        .filter((entry) => entry.categories.length > 0),
    [words],
  );
  const resultCount = visible.reduce((sum, g) => sum + g.categories.reduce((n, c) => n + c.items.length, 0), 0);

  // Light up the tab of the category currently near the top of the screen.
  useEffect(() => {
    if (searching) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-menu-category]"));
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;
    const onScreen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target.id);
          else onScreen.delete(entry.target.id);
        }
        const first = sections.find((section) => onScreen.has(section.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-22% 0px -62% 0px" },
    );
    sections.forEach((section) => io.observe(section));
    return () => io.disconnect();
  }, [searching]);

  // Keep the active tab in view inside the (sideways-scrolling) tab row.
  useEffect(() => {
    const tabs = tabsRef.current;
    const tab = tabs?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`);
    if (!tabs || !tab) return;
    tabs.scrollTo({
      left: tab.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeId]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const scroll = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    };
    if (searching) {
      // Leave search first so the section exists again, then jump.
      setQuery("");
      setSearchOpen(false);
      setTimeout(scroll, 60);
    } else {
      scroll();
    }
    setActiveId(id);
  };

  const closeSearch = () => {
    setQuery("");
    setSearchOpen(false);
  };

  return (
    <div className="ons-menu">
      {/* ---------- Sticky bar: tabs + search ---------- */}
      <div className="ons-menu-bar" data-search={searchOpen || searching}>
        <div className="ons-container ons-menu-bar-inner">
          <button
            type="button"
            className="ons-menu-search-toggle"
            aria-label="Search the menu"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(true)}
          >
            <Search size={18} strokeWidth={1.6} aria-hidden />
          </button>

          <nav ref={tabsRef} className="ons-chips ons-menu-tabs" aria-label="Menu categories">
            {menu.map((group, g) =>
              group.categories.map((category, c) => (
                <a
                  key={category.id}
                  href={`#${category.id}`}
                  data-tab={category.id}
                  data-group-start={g > 0 && c === 0 ? "" : undefined}
                  className="ons-chip"
                  aria-current={!searching && activeId === category.id ? "true" : undefined}
                  onClick={(event) => jumpTo(event, category.id)}
                >
                  {category.name}
                </a>
              )),
            )}
          </nav>

          <div className="ons-menu-search" role="search">
            <Search size={18} strokeWidth={1.6} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search dishes"
              aria-label="Search the menu"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
            />
            <button
              type="button"
              className="ons-menu-search-clear"
              aria-label="Clear search"
              data-idle={!searching && !searchOpen ? "" : undefined}
              onClick={closeSearch}
            >
              <X size={16} strokeWidth={1.6} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* ---------- The menu ---------- */}
      <div className="ons-container ons-menu-body">
        <p className="ons-menu-status" role="status" aria-live="polite">
          {searching && (resultCount === 0 ? `No dishes match “${query.trim()}”.` : `${resultCount} ${resultCount === 1 ? "dish matches" : "dishes match"} “${query.trim()}”.`)}
        </p>
        {searching && resultCount === 0 && (
          <button type="button" className="ons-btn ons-btn-olive" onClick={closeSearch}>
            Show the full menu
          </button>
        )}

        {visible.map(({ group, categories }, g) => {
          const art = GROUP_ART.get(group.id);
          return (
            <section key={group.id} id={group.id} className="ons-menu-group" aria-labelledby={`${group.id}-title`}>
              <header className="ons-menu-group-head">
                {art && <FoodArt name={art} className="ons-menu-group-art" />}
                <p className="ons-eyebrow">{String(menu.indexOf(group) + 1).padStart(2, "0")}</p>
                <h2 id={`${group.id}-title`} className="ons-display ons-h2">
                  {group.name}
                </h2>
              </header>

              <div className="ons-menu-cats">
                {categories.map(({ category, items }) => (
                  <section
                    key={category.id}
                    id={category.id}
                    className="ons-menu-cat"
                    aria-labelledby={`${category.id}-title`}
                    data-menu-category
                  >
                    <header className="ons-menu-cat-head">
                      <h3 id={`${category.id}-title`} className="ons-display ons-h3">
                        {category.name}
                      </h3>
                      {(category.note || category.sideOptions) && (
                        <p className="ons-menu-cat-note">
                          {category.note}
                          {category.sideOptions && (
                            <>
                              Side options: <span>{category.sideOptions.join(" | ")}</span>
                            </>
                          )}
                        </p>
                      )}
                    </header>

                    <ul className="ons-menu-items">
                      {items.map((item) => (
                        <MenuRow key={item.id} item={item} />
                      ))}
                    </ul>

                    {category.extras?.map((extra) => (
                      <p key={extra.name} className="ons-menu-extra">
                        <span>{extra.name}</span>
                        <span>
                          {extra.prices.map((price) => (price.label ? `${price.label} ${formatRs(price.amount)}` : formatRs(price.amount))).join("  /  ")}
                        </span>
                      </p>
                    ))}
                  </section>
                ))}
              </div>
              {g < visible.length - 1 && <hr className="ons-menu-rule" />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const many = item.prices.length > 1;
  return (
    <li className="ons-menu-item" data-many={many ? "" : undefined}>
      <div className="ons-menu-item-main">
        <h4 className="ons-menu-item-name">
          {item.name}
          {item.chefSpecial && <ChefMark size={15} />}
          <SpiceMark level={item.spiceLevel} />
        </h4>
        {item.description && <p className="ons-menu-item-desc">{item.description}</p>}
        {(item.serving || item.options) && (
          <p className="ons-menu-item-tags">
            {item.serving && <span className="ons-tag">{item.serving}</span>}
            {item.options && <span className="ons-tag">{item.options.join(" / ")}</span>}
          </p>
        )}
      </div>
      <div className="ons-menu-item-prices">
        {item.prices.map((price, i) => (
          <span key={price.label ?? i} className="ons-price">
            {price.label && <span className="ons-price-label">{price.label}</span>}
            <span className="ons-price-amount">{formatRs(price.amount)}</span>
          </span>
        ))}
      </div>
    </li>
  );
}
