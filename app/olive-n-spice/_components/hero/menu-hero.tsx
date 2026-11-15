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

// =====================================================================
// The home page hero: an interactive tour of the menu.
// ---------------------------------------------------------------------
// Six slides, one per menu group. Ways to move between them:
//   - drag / swipe sideways
//   - mouse wheel or trackpad (only while the page is at the very top;
//     at the last slide the wheel goes back to scrolling the page)
//   - left / right arrow keys
//   - the small previous / next buttons
//   - the six-dot progress bar at the bottom
// The background colour glides between brand tones as slides change.
// "Explore" (or a tap on the dishes) opens a panel with that group's
// dishes and prices.
//
// Only cheap properties are animated (transform, opacity, colour), so it
// stays smooth on phones. With "reduce motion" switched on, the carousel
// is replaced by a plain grid of six cards (done in CSS, see olive.css).
// =====================================================================

// Join each slide with its menu group once.
const SLIDES = heroSlides.flatMap((slide) => {
  const group = menu.find((g) => g.id === slide.groupId);
  return group ? [{ slide, group }] : [];
});
const TOTAL = SLIDES.length;

/** Where a slide waits relative to the one on screen (the row wraps around like a ring). */
function slideState(i: number, current: number): "active" | "before" | "after" {
  const distance = (i - current + TOTAL) % TOTAL;
  if (distance === 0) return "active";
  return distance <= TOTAL / 2 ? "after" : "before";
}

export function MenuHero() {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<{ groupId: string | null; open: boolean }>({ groupId: null, open: false });

  const carouselRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Mirrors of state for the event listeners below (they must not re-attach on every change).
  const indexRef = useRef(index);
  const panelOpenRef = useRef(panel.open);
  useEffect(() => {
    indexRef.current = index;
    panelOpenRef.current = panel.open;
  }, [index, panel.open]);

  const go = useCallback((step: number) => setIndex((i) => (i + step + TOTAL) % TOTAL), []);
  const openPanel = useCallback((groupId: string) => setPanel({ groupId, open: true }), []);
  const closePanel = useCallback(() => setPanel((p) => ({ ...p, open: false })), []);

  // ---- Mouse wheel / trackpad -------------------------------------------
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    let lastWheelAt = 0; // time of the previous wheel event
    let lastChangeAt = -Infinity; // time we last changed slide
    let lastPageScrollAt = -Infinity; // time the PAGE last scrolled
    let travelled = 0;

    const onPageScroll = () => {
      lastPageScrollAt = performance.now();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom
      if (carousel.offsetParent === null) return; // hidden (reduced-motion grid is showing)
      if (window.scrollY > 4) return; // page is scrolled: behave like a normal page
      if (event.timeStamp - lastPageScrollAt < 400) return; // the tail of a scroll back up to the top

      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = sideways ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const step = delta > 0 ? 1 : -1;

      // A trackpad flick sends events for a second or so. Treat a burst as ONE gesture.
      const sameGesture = event.timeStamp - lastWheelAt < 140;
      lastWheelAt = event.timeStamp;
      if (sameGesture && event.timeStamp - lastChangeAt < 1100) {
        event.preventDefault();
        return;
      }

      // At either end, an up/down wheel is handed back to the page so it can scroll on.
      const current = indexRef.current;
      if (!sideways && ((step > 0 && current === TOTAL - 1) || (step < 0 && current === 0))) return;

      event.preventDefault();
      travelled = sameGesture ? travelled + delta : delta;
      if (Math.abs(travelled) < 24) return;
      travelled = 0;
      lastChangeAt = event.timeStamp;
      go(step);
    };

    carousel.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onPageScroll, { passive: true });
    return () => {
      carousel.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onPageScroll);
    };
  }, [go]);

  // ---- Arrow keys --------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (panelOpenRef.current) return;
      const carousel = carouselRef.current;
      if (!carousel || carousel.offsetParent === null) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog, [contenteditable='true']")) return;
      // Only while the hero is still the main thing on screen.
      if (carousel.getBoundingClientRect().bottom < window.innerHeight * 0.5) return;
      event.preventDefault();
      go(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  // ---- Drag / swipe ------------------------------------------------------
  // The dishes follow the finger (a CSS variable, no React re-render), then
  // either move on to the next slide or spring back.
  const drag = useRef<{ id: number; x: number; y: number; dx: number; active: boolean } | null>(null);
  const justDragged = useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, active: false };
    justDragged.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const stage = stageRef.current;
    if (!d || !stage || event.pointerId !== d.id) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // an up/down move: let the page scroll
        return;
      }
      d.active = true;
      stage.setPointerCapture(event.pointerId);
      stage.setAttribute("data-dragging", "");
    }
    d.dx = dx;
    stage.style.setProperty("--drag", `${Math.round(dx * 0.6)}px`);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const stage = stageRef.current;
    if (!d || event.pointerId !== d.id) return;
    drag.current = null;
    if (!stage || !d.active) return;
    stage.removeAttribute("data-dragging");
    stage.style.removeProperty("--drag");
    justDragged.current = true;
    if (event.type === "pointerup" && Math.abs(d.dx) > 56) go(d.dx < 0 ? 1 : -1);
  };

  const current = SLIDES[index];
  const panelGroup = SLIDES.find((s) => s.group.id === panel.groupId)?.group ?? null;

  return (
    <section
      className="ons-hero"
      data-tone={current.slide.tone}
      style={{ "--hero-bg": current.slide.background, "--hero-index": index } as React.CSSProperties}
      aria-label="Explore the menu"
    >
      {/* ---------- The carousel (hidden when reduced motion is on) ---------- */}
      <div ref={carouselRef} className="ons-hero-carousel" role="group" aria-roledescription="carousel" aria-label="Menu groups">
        <OliveBranch className="ons-hero-branch ons-hero-branch-a" />
        <OliveBranch className="ons-hero-branch ons-hero-branch-b" />

        <h1 className="ons-hero-eyebrow">
          <span className="sr-only">{site.name}: </span>
          {site.tagline}
        </h1>

        <div
          ref={stageRef}
          className="ons-hero-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(event) => {
            // A drag must not count as a click on the dishes.
            if (!justDragged.current) return;
            justDragged.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="ons-hero-deco" aria-hidden="true">
            <span className="ons-hero-glow ons-hero-glow-light" />
            <span className="ons-hero-glow ons-hero-glow-dark" />
            <span className="ons-hero-ring" />
          </div>
          {SLIDES.map(({ slide, group }, i) => (
            <HeroSlideView
              key={group.id}
              slide={slide}
              group={group}
              index={i}
              total={TOTAL}
              state={slideState(i, index)}
              onExplore={() => openPanel(group.id)}
            />
          ))}
        </div>

        <div className="ons-hero-actions">
          <button
            type="button"
            className="ons-btn ons-hero-explore"
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
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button type="button" className="ons-hero-arrow" aria-label="Next menu group" onClick={() => go(1)}>
            <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <p className="ons-hero-hint" aria-hidden="true">
          Drag, scroll or use the arrow keys
        </p>

        {/* Tells screen readers which slide is showing after each change. */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {current.group.name}, slide {index + 1} of {TOTAL}
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
