"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// =====================================================================
// The thin line on the left edge of every page that fills from top to
// bottom as you scroll, with a small "52%" under it.
// ---------------------------------------------------------------------
// It sits in the shared layout, so Home, Menu, Events and Reserve all get
// it. It is decoration only: it cannot be clicked, never covers a button
// (pointer-events: none) and is hidden from screen readers, who already
// know where they are on the page.
//
// STAYING READABLE: the page has cream sections and dark olive sections.
// The indicator is drawn twice, exactly on top of itself: once in dark
// gold (for cream) and once in light gold (for olive). The light-gold
// copy is only allowed to show where a dark section is behind it, so if
// the line straddles two sections, each part gets the right colour.
//
// STAYING LIGHT: the positions of the dark sections are measured only
// when the page changes size or content, never while scrolling. A scroll
// just does a little arithmetic once per screen refresh and changes
// `transform` (which the browser can do without redrawing the page).
// =====================================================================

/** Everything that has (or can have) a dark background: the hero, the dark bands and the footer. */
const SECTIONS = ".ons-hero, section.ons-on-dark, footer.ons-on-dark";
const HIDE_ALL = "linear-gradient(transparent, transparent)";

type Section = {
  top: number;
  bottom: number;
  /** Set for the hero only: it is dark or light depending on the group showing, so we ask it each time. */
  hero: HTMLElement | null;
};

export function ScrollProgress() {
  const rootRef = useRef<HTMLDivElement>(null);
  const remeasure = useRef<(() => void) | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = rootRef.current;
    const site = root?.closest<HTMLElement>(".ons");
    if (!root || !site) return;
    const fills = Array.from(root.querySelectorAll<HTMLElement>(".ons-progress-fill"));
    const labels = Array.from(root.querySelectorAll<HTMLElement>(".ons-progress-label"));

    let scrollable = 0; // how far the page can scroll, in pixels
    let top = 0; // where the indicator sits on the screen
    let height = 0;
    let sections: Section[] = []; // where each section starts and ends, measured from the top of the page
    let frame = 0;
    let needsMeasure = true;
    let lastPercent = -1;
    let lastMask = "";

    const measure = () => {
      const box = root.getBoundingClientRect();
      top = box.top;
      height = box.height;
      scrollable = document.documentElement.scrollHeight - window.innerHeight;
      sections = Array.from(site.querySelectorAll<HTMLElement>(SECTIONS))
        .map((el): Section => {
          const rect = el.getBoundingClientRect();
          return {
            top: rect.top + window.scrollY,
            bottom: rect.bottom + window.scrollY,
            hero: el.classList.contains("ons-hero") ? el : null,
          };
        })
        .filter((section) => section.bottom > section.top)
        .sort((a, b) => a.top - b.top);
      // Nothing to scroll (a very short page): hide the indicator.
      root.toggleAttribute("data-idle", scrollable < 8);
    };

    const draw = () => {
      frame = 0;
      if (needsMeasure) {
        needsMeasure = false;
        measure();
      }
      const y = window.scrollY;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, y / scrollable)) : 0;
      for (const fill of fills) fill.style.transform = `scaleY(${progress.toFixed(4)})`;

      const percent = Math.round(progress * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        for (const label of labels) label.textContent = `${percent}%`;
      }

      // Which parts of the indicator have a dark section behind them right now?
      const from = y + top;
      const to = from + height;
      const parts: string[] = [];
      for (const section of sections) {
        if (section.hero && section.hero.dataset.tone !== "dark") continue; // the hero is on a light group
        const start = Math.round(Math.max(section.top, from) - from);
        const end = Math.round(Math.min(section.bottom, to) - from);
        if (end > start) parts.push(`transparent ${start}px, #000 ${start}px, #000 ${end}px, transparent ${end}px`);
      }
      const mask = parts.length > 0 ? `linear-gradient(to bottom, ${parts.join(", ")})` : HIDE_ALL;
      if (mask !== lastMask) {
        lastMask = mask;
        root.style.setProperty("--ons-progress-mask", mask);
      }
    };

    /** Ask for one redraw on the next screen refresh (many scroll events = still one redraw). */
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const scheduleMeasure = () => {
      needsMeasure = true;
      schedule();
    };
    remeasure.current = scheduleMeasure;

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    // The page got taller or shorter (new page, images arriving, fonts loading).
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(site);
    // The hero switched between a light and a dark group: nothing moved, so just redraw (no measuring).
    const toneObserver = new MutationObserver(schedule);
    toneObserver.observe(site, { subtree: true, attributes: true, attributeFilter: ["data-tone"] });

    measure();
    needsMeasure = false;
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver.disconnect();
      toneObserver.disconnect();
      remeasure.current = null;
    };
  }, []);

  // Moving to another page: its sections are in different places, so measure again.
  useEffect(() => {
    remeasure.current?.();
  }, [pathname]);

  return (
    <div ref={rootRef} className="ons-progress" aria-hidden="true">
      {(["light", "dark"] as const).map((background) => (
        <div key={background} className="ons-progress-ink" data-on={background}>
          <span className="ons-progress-track">
            <span className="ons-progress-fill" />
          </span>
          <span className="ons-progress-label">0%</span>
        </div>
      ))}
    </div>
  );
}
