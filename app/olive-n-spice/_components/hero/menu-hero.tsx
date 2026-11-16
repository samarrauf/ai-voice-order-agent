"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { menuAnchor, routes, site } from "@/data/sites/olive-n-spice/config";
import { heroSlides } from "@/data/sites/olive-n-spice/hero";
import { menu } from "@/data/sites/olive-n-spice/menu";
import { FoodArt } from "../food-art";
import { OliveBranch } from "../ornaments";
import { GroupPanel } from "./group-panel";
import { HeroSlideView } from "./hero-slide";
import { useHeroTrack } from "./use-hero-track";

// =====================================================================
// The home page hero: an interactive tour of the menu.
// ---------------------------------------------------------------------
// The six menu groups sit on ONE moving strip (it loops round like a ring).
// The group in the middle is large and sharp; its two neighbours peek in
// at the edges of the screen, smaller, fainter and slightly blurred.
//
// Ways to move the strip:
//   - drag / swipe sideways (it follows the finger, keeps its speed when
//     you let go, then a soft spring settles it on the nearest group)
//   - a sideways trackpad scroll
//   - left / right arrow keys
//   - the small previous / next buttons
//   - the six-dot progress bar at the bottom
//   - a click on a side group
// The mouse wheel is NOT used: an up/down wheel scrolls the page as normal.
//
// The background colour and the group's name change gradually as the
// strip moves. "Explore" (or a tap on the middle dishes) opens a panel
// with that group's dishes and prices.
//
// The movement itself lives in use-hero-track.ts. This file is the
// furniture around it: buttons, dots, the panel, screen-reader text.
//
// With "reduce motion" switched on, the strip is replaced by a plain grid
// of six cards (done in CSS, see olive.css).
// =====================================================================

// Join each slide with its menu group once.
const SLIDES = heroSlides.flatMap((slide) => {
  const group = menu.find((g) => g.id === slide.groupId);
  return group ? [{ slide, group }] : [];
});
const TOTAL = SLIDES.length;
/** 0 = light background, 1 = dark background, for each group. */
const TONES = SLIDES.map(({ slide }) => (slide.tone === "dark" ? 1 : 0));

export function MenuHero() {
  // The group nearest the middle right now (changes while the strip is still moving).
  const [index, setIndex] = useState(0);
  // The group the strip last came to rest on (what screen readers are told).
  const [rested, setRested] = useState(0);
  const [panel, setPanel] = useState<{ groupId: string | null; open: boolean }>({ groupId: null, open: false });

  const carouselRef = useRef<HTMLDivElement>(null);
  // Mirror of state for the key listener below (it must not re-attach on every change).
  const panelOpenRef = useRef(panel.open);
  useEffect(() => {
    panelOpenRef.current = panel.open;
  }, [panel.open]);

  const { go, goTo } = useHeroTrack(carouselRef, { tones: TONES, onNearest: setIndex, onRest: setRested });
  const openPanel = useCallback((groupId: string) => setPanel({ groupId, open: true }), []);
  const closePanel = useCallback(() => setPanel((p) => ({ ...p, open: false })), []);

  // ---- Arrow keys --------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (panelOpenRef.current) return;
      const carousel = carouselRef.current;
      if (!carousel || carousel.offsetParent === null) return; // hidden (reduced-motion grid is showing)
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, dialog, [contenteditable='true']")) return;
      // Only while the hero is still the main thing on screen.
      if (carousel.getBoundingClientRect().bottom < window.innerHeight * 0.5) return;
      event.preventDefault();
      go(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  const current = SLIDES[index];
  const panelGroup = SLIDES.find((s) => s.group.id === panel.groupId)?.group ?? null;

  return (
    <section className="ons-hero" data-tone={current.slide.tone} aria-label="Explore the menu">
      {/* ---------- The strip (hidden when reduced motion is on) ---------- */}
      <div ref={carouselRef} className="ons-hero-carousel" role="group" aria-roledescription="carousel" aria-label="Menu groups">
        {/* One sheet of colour per group; the engine fades between them as the strip moves. */}
        <div className="ons-hero-bg" aria-hidden="true">
          {SLIDES.map(({ slide, group }) => (
            <span key={group.id} style={{ backgroundColor: slide.background }} />
          ))}
        </div>
        <OliveBranch className="ons-hero-branch ons-hero-branch-a" />
        <OliveBranch className="ons-hero-branch ons-hero-branch-b" />

        <h1 className="ons-hero-eyebrow">
          <span className="sr-only">{site.name}: </span>
          {site.tagline}
        </h1>

        {/* The stage: drags, swipes and clicks on it are handled in use-hero-track.ts. */}
        <div className="ons-hero-stage">
          <div className="ons-hero-deco" aria-hidden="true">
            <span className="ons-hero-glow ons-hero-glow-light" />
            <span className="ons-hero-glow ons-hero-glow-dark" />
            <span className="ons-hero-ring" />
          </div>
          {SLIDES.map(({ slide, group }, i) => (
            <HeroSlideView key={group.id} slide={slide} group={group} index={i} total={TOTAL} active={i === index} onExplore={openPanel} />
          ))}
        </div>

        <div className="ons-hero-actions">
          <button
            type="button"
            className="ons-btn ons-hero-explore"
            style={{ "--hero-bg": current.slide.background } as React.CSSProperties}
            aria-haspopup="dialog"
            aria-label={`Explore the ${current.group.name} menu`}
            onClick={() => openPanel(current.group.id)}
          >
            Explore
            <ArrowRight size={16} className="ons-btn-arrow" aria-hidden />
          </button>
          <Link href={routes.reserve} className="ons-btn ons-btn-gold">
            Reserve a table
          </Link>
        </div>

        <div className="ons-hero-controls">
          <button type="button" className="ons-hero-arrow" aria-label="Previous menu group" onClick={() => go(-1)}>
            <ArrowLeft size={18} strokeWidth={1.5} aria-hidden />
          </button>
          <div className="ons-dots" role="group" aria-label="Choose a menu group">
            {SLIDES.map(({ group }, i) => (
              <button
                key={group.id}
                type="button"
                className="ons-dot"
                aria-label={`${group.name} (${i + 1} of ${TOTAL})`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <button type="button" className="ons-hero-arrow" aria-label="Next menu group" onClick={() => go(1)}>
            <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <p className="ons-hero-hint" aria-hidden="true">
          Drag or use the arrow keys
        </p>

        {/* Tells screen readers which group is showing, once the strip has stopped. */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {SLIDES[rested].group.name}, slide {rested + 1} of {TOTAL}
        </p>
      </div>

      {/* ---------- Reduced motion: a plain grid of the six groups ---------- */}
      <div className="ons-hero-grid">
        <div className="ons-container">
          <p className="ons-eyebrow ons-eyebrow-center">{site.tagline}</p>
          <p className="ons-display ons-h2 mt-4">Explore the menu</p>
          <ul className="ons-hero-grid-list">
            {SLIDES.map(({ slide, group }) => (
              <li key={group.id} className="ons-hero-card">
                <FoodArt name={slide.art[1]} className="ons-hero-card-art" />
                <h2 className="ons-display ons-h3">{group.name}</h2>
                <p className="ons-hero-card-cats">{group.categories.map((c) => c.shortName ?? c.name).join(" · ")}</p>
                <div className="ons-hero-card-actions">
                  <button
                    type="button"
                    className="ons-btn ons-btn-olive ons-btn-sm"
                    aria-haspopup="dialog"
                    aria-label={`Explore the ${group.name} menu`}
                    onClick={() => openPanel(group.id)}
                  >
                    Explore
                  </button>
                  <Link href={menuAnchor(group.id)} className="ons-link" aria-label={`${group.name} on the full menu`}>
                    Full menu
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <Link href={routes.reserve} className="ons-btn ons-btn-gold mt-10">
            Reserve a table
          </Link>
        </div>
      </div>

      <GroupPanel group={panelGroup} open={panel.open} onClose={closePanel} />
    </section>
  );
}
