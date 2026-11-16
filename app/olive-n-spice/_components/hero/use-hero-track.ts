"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

// =====================================================================
// The "engine" behind the home page hero strip.
// ---------------------------------------------------------------------
// The six menu groups sit on one long strip that loops round like a ring.
// This file keeps ONE number, `pos`: where the strip is, counted in groups
// (0 = first group in the middle, 0.5 = halfway to the second, and so on).
// Everything on screen is worked out from that number, many times a second:
//   - where each group sits, how big, how faint and how blurred it is
//   - how far each of its three dishes has slid, turned and lifted
//   - which two background colours are showing, and how much of each
//   - how far the group's name has faded and slid
//
// What moves the strip:
//   - a finger or mouse drag (the strip follows 1:1)
//   - letting go: it carries on with the speed it had, then a soft spring
//     settles it on the nearest group
//   - a sideways trackpad scroll (an up/down wheel is left alone, so the
//     page scrolls normally)
//   - go() / goTo(), used by the buttons, dots and arrow keys
//
// For speed it writes straight to the page instead of going through
// React, and only touches `transform`, `opacity` and `filter`, which the
// browser can animate without redrawing the page (smooth on phones too).
// When nothing is moving, it does no work at all.
// =====================================================================

/** Side groups are drawn at this size (1 = full size). */
const NEIGHBOUR_SCALE = 0.6;
/** ...and this faint (1 = solid). */
const NEIGHBOUR_OPACITY = 0.5;
/** A group this many places from the middle is off screen and is switched off. */
const HIDE_AT = 1.65;

/** Spring that settles the strip. Higher stiffness = snappier; higher damping = less bounce. */
const SPRING_STIFFNESS = 80;
const SPRING_DAMPING = 14.5;
/** Fastest fling we accept, in groups per second. */
const MAX_FLING = 9;
/** A flick faster than this (pixels per second) always moves on at least one group. */
const FLICK_SPEED = 300;

// Depth of the three dishes: left, centre, right.
/** How far each dish slides ahead of / behind the strip mid-move (as a share of the group's width). */
const PARALLAX = [-0.11, 0.07, -0.05];
/** Degrees each dish turns for every place its group is away from the middle. */
const SPIN = [-6, 4, 8];
/** Degrees each dish leans at full speed. */
const LEAN = [6, 9, 12];
/** Pixels each dish lifts off the ground at full speed (its shadow shrinks to match). */
const LIFT = [8, 14, 10];
/** Strip speed (pixels per second) that counts as "full speed" for leaning and lifting. */
const FULL_SPEED = 2600;

type Options = {
  /** 0 for a light background, 1 for a dark one; one entry per group. */
  tones: number[];
  /** Called when a different group becomes the one nearest the middle. */
  onNearest: (index: number) => void;
  /** Called when the strip comes to rest on a group. */
  onRest: (index: number) => void;
};

type SlideParts = {
  cluster: HTMLElement;
  text: HTMLElement;
  items: HTMLElement[];
  shadows: HTMLElement[];
  hidden?: boolean;
  textHidden?: boolean;
  blur?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mod = (value: number, n: number) => ((value % n) + n) % n;

export function useHeroTrack(carouselRef: RefObject<HTMLElement | null>, options: Options) {
  // Latest callbacks, so the big effect below never has to restart.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const api = useRef<{ go: (step: number) => void; goTo: (index: number) => void } | null>(null);

  useEffect(() => {
    const carousel = carouselRef.current;
    const stage = carousel?.querySelector<HTMLElement>(".ons-hero-stage");
    if (!carousel || !stage) return;

    // ---- Find the pieces once -------------------------------------------
    const slides: SlideParts[] = Array.from(stage.querySelectorAll<HTMLElement>(".ons-slide")).map((el) => ({
      cluster: el.querySelector<HTMLElement>(".ons-cluster")!,
      text: el.querySelector<HTMLElement>(".ons-slide-text")!,
      items: Array.from(el.querySelectorAll<HTMLElement>(".ons-cluster-item")),
      shadows: Array.from(el.querySelectorAll<HTMLElement>(".ons-shadow-wrap")),
    }));
    const backgrounds = Array.from(carousel.querySelectorAll<HTMLElement>(".ons-hero-bg > span"));
    const ring = stage.querySelector<HTMLElement>(".ons-hero-ring");
    const glowLight = stage.querySelector<HTMLElement>(".ons-hero-glow-light");
    const glowDark = stage.querySelector<HTMLElement>(".ons-hero-glow-dark");
    const total = slides.length;
    if (total === 0) return;
    const tones = optionsRef.current.tones; // a fixed list: it never changes after the first render
    const half = total / 2;
    /** Shortest way round the ring: turns any distance into one between -half and +half. */
    const wrap = (value: number) => mod(value + half, total) - half;

    // ---- State ------------------------------------------------------------
    let pos = 0; // where the strip is, in groups
    let vel = 0; // its speed, in groups per second
    let target = 0; // the group the spring is heading for
    let mode: "rest" | "spring" | "drag" | "held" | "wheel" = "rest";
    let lean = 0; // smoothed speed, -1..1: drives the lean and lift of the dishes
    let nearest = 0;

    let gap = 0; // pixels between the middles of two neighbouring groups
    let groupWidth = 0; // width of one group of three dishes
    let maxBlur = 4;

    let frame = 0;
    let lastTime = 0;
    let prevPos = 0;
    let lastFrom = -1;
    let lastTo = -1;

    /** Measure the screen. Returns false while the carousel is hidden (reduced motion). */
    const measure = () => {
      const width = stage.clientWidth;
      if (width === 0) return false;
      groupWidth = slides[0].cluster.offsetWidth;
      // Side groups sit half off the edge of the screen. On narrow screens they are
      // pushed out a little further so they do not hide behind the middle group.
      gap = Math.max(width * 0.5, groupWidth * (0.5 + NEIGHBOUR_SCALE * 0.5 - 0.07));
      maxBlur = width < 640 ? 2.5 : 4;
      return true;
    };

    /** Draw everything for the current `pos`. */
    const render = () => {
      if (gap === 0) return;

      // Background: the colour we are leaving sits underneath, the colour we are
      // heading for fades in on top. Fading one solid colour over another is the
      // same as mixing them, and costs the browser almost nothing.
      const base = Math.floor(pos);
      const mix = pos - base;
      const from = mod(base, total);
      const to = mod(base + 1, total);
      if (from !== lastFrom || to !== lastTo) {
        lastFrom = from;
        lastTo = to;
        backgrounds.forEach((layer, i) => {
          layer.style.zIndex = i === to ? "1" : "0";
          if (i !== to) layer.style.opacity = i === from ? "1" : "0";
        });
      }
      if (backgrounds[to]) backgrounds[to].style.opacity = mix.toFixed(3);

      const dark = tones[from] + (tones[to] - tones[from]) * mix;
      if (glowLight) glowLight.style.opacity = (1 - dark).toFixed(3);
      if (glowDark) glowDark.style.opacity = dark.toFixed(3);
      if (ring) ring.style.rotate = `${(pos * 60).toFixed(2)}deg`;

      const speed = Math.abs(lean);
      const shadowScale = (1 - speed * 0.28).toFixed(3);
      const shadowOpacity = (1 - speed * 0.45).toFixed(3);

      for (let i = 0; i < total; i++) {
        const slide = slides[i];
        const d = wrap(i - pos); // places away from the middle (negative = to the left)
        const away = Math.abs(d);

        // ---- The three dishes
        if (away >= HIDE_AT) {
          if (slide.hidden !== true) {
            slide.hidden = true;
            slide.cluster.style.visibility = "hidden";
          }
        } else {
          if (slide.hidden !== false) {
            slide.hidden = false;
            slide.cluster.style.visibility = "visible";
          }
          const near = Math.min(away, 1);
          const scale = 1 - (1 - NEIGHBOUR_SCALE) * near;
          const opacity =
            away <= 1 ? 1 - (1 - NEIGHBOUR_OPACITY) * near : NEIGHBOUR_OPACITY * (1 - (away - 1) / (HIDE_AT - 1));
          slide.cluster.style.transform = `translate3d(${(d * gap).toFixed(1)}px,0,0) scale(${scale.toFixed(4)})`;
          slide.cluster.style.opacity = opacity.toFixed(3);
          const blur = Math.round(near * maxBlur * 2) / 2; // in half-pixel steps, so it is not redone every frame
          if (blur !== slide.blur) {
            slide.blur = blur;
            slide.cluster.style.filter = blur > 0 ? `blur(${blur}px)` : "";
          }

          // Depth: each dish slides at its own speed between two resting places
          // (the wave is zero whenever a group is exactly on a resting place, so
          // the dishes always come back together neatly), turns a little as its
          // group moves away, and leans + lifts with the speed of the strip.
          const wave = Math.sin(Math.PI * d);
          for (let j = 0; j < slide.items.length; j++) {
            const x = wave * groupWidth * PARALLAX[j];
            const y = -speed * LIFT[j];
            const turn = d * SPIN[j] + lean * LEAN[j];
            slide.items[j].style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${turn.toFixed(2)}deg)`;
            const shadow = slide.shadows[j];
            if (shadow) {
              shadow.style.transform = `scale(${shadowScale})`;
              shadow.style.opacity = shadowOpacity;
            }
          }
        }

        // ---- The group's name and category line: fades and slides with the strip
        const textOpacity = clamp(1 - away * 1.8, 0, 1);
        if (textOpacity <= 0) {
          if (slide.textHidden !== true) {
            slide.textHidden = true;
            slide.text.style.visibility = "hidden";
          }
        } else {
          if (slide.textHidden !== false) {
            slide.textHidden = false;
            slide.text.style.visibility = "visible";
          }
          slide.text.style.opacity = textOpacity.toFixed(3);
          slide.text.style.transform = `translate3d(${(d * Math.min(gap, 420) * 0.35).toFixed(1)}px,0,0)`;
        }
      }
    };

    // ---- The animation loop (runs only while something is moving) ----------
    const tick = (now: number) => {
      frame = 0;
      const dt = clamp((now - lastTime) / 1000, 0.001, 0.05);
      lastTime = now;

      if (mode === "spring") {
        // Small fixed steps keep the spring steady even if a frame arrives late.
        let left = dt;
        while (left > 0.00001) {
          const step = Math.min(left, 1 / 240);
          vel += (-SPRING_STIFFNESS * (pos - target) - SPRING_DAMPING * vel) * step;
          pos += vel * step;
          left -= step;
        }
        if (Math.abs(pos - target) < 0.0004 && Math.abs(vel) < 0.004) {
          pos = target;
          vel = 0;
        }
      }

      const moved = (pos - prevPos) / dt; // groups per second, whatever is moving the strip
      prevPos = pos;
      if (mode !== "spring") vel = moved;
      lean += (clamp((moved * gap) / FULL_SPEED, -1, 1) - lean) * (1 - Math.exp(-dt * 12));
      if (moved === 0 && Math.abs(lean) < 0.003) lean = 0;

      render();

      const current = mod(Math.round(pos), total);
      if (current !== nearest) {
        nearest = current;
        optionsRef.current.onNearest(current);
      }

      if (mode === "spring" && pos === target && lean === 0) {
        // Arrived. Fold the count back into 0..5 (the ring looks the same) and stop.
        mode = "rest";
        pos = target = prevPos = mod(pos, total);
        optionsRef.current.onRest(nearest);
        return;
      }
      if (mode === "held" && lean === 0) return; // caught under a finger that is not moving
      frame = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (frame) return;
      lastTime = performance.now();
      prevPos = pos;
      frame = requestAnimationFrame(tick);
    };

    const springTo = (next: number, startSpeed = vel) => {
      target = next;
      vel = clamp(startSpeed, -MAX_FLING, MAX_FLING);
      mode = "spring";
      wake();
    };

    // ---- Buttons, dots and arrow keys ------------------------------------
    const dragging = () => pointer?.active === true;
    const restingPlace = () => (mode === "spring" ? target : Math.round(pos));
    api.current = {
      go: (step) => {
        if (gap === 0 || dragging()) return;
        springTo(restingPlace() + step);
      },
      goTo: (index) => {
        if (gap === 0 || dragging()) return;
        const from = restingPlace();
        springTo(from + wrap(index - mod(from, total)));
      },
    };

    // ---- Drag / swipe ----------------------------------------------------
    let pointer: {
      id: number;
      x: number;
      y: number;
      startPos: number;
      active: boolean;
      samples: { time: number; x: number }[];
    } | null = null;
    let swallowClick = false; // a drag must not also count as a click

    const onPointerDown = (event: PointerEvent) => {
      if (pointer?.active || gap === 0) return; // one drag at a time
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startPos: pos, active: false, samples: [] };
      swallowClick = false;
      // Touching a strip that is still moving catches it, like a finger on a spinning wheel.
      if (mode === "spring" || mode === "wheel") {
        if (mode === "wheel") target = Math.round(pos);
        mode = "held";
        vel = 0;
      }
    };

    const letGo = () => {
      pointer = null;
      if (mode === "held") springTo(target, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      const p = pointer;
      if (!p || event.pointerId !== p.id) return;
      if (!p.active) {
        const dx = event.clientX - p.x;
        const dy = event.clientY - p.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          letGo(); // an up/down move: leave it to the page
          return;
        }
        p.active = true;
        p.x = event.clientX; // start counting from here, so there is no jump
        p.startPos = pos;
        try {
          stage.setPointerCapture(event.pointerId);
        } catch {
          // The pointer has already gone; the drag simply ends on the next event.
        }
        stage.setAttribute("data-dragging", "");
        mode = "drag";
        wake();
      }
      pos = p.startPos - (event.clientX - p.x) / gap;
      p.samples.push({ time: event.timeStamp, x: event.clientX });
      if (p.samples.length > 10) p.samples.shift();
    };

    const onPointerEnd = (event: PointerEvent) => {
      const p = pointer;
      if (!p || event.pointerId !== p.id) return;
      if (!p.active) {
        letGo();
        return;
      }
      pointer = null;
      stage.removeAttribute("data-dragging");
      swallowClick = true;

      // How fast was the finger going over its last tenth of a second?
      let speed = 0; // groups per second
      const latest = p.samples[p.samples.length - 1];
      if (event.type === "pointerup" && latest && event.timeStamp - latest.time < 80) {
        const first = p.samples.find((sample) => latest.time - sample.time <= 100) ?? latest;
        if (latest.time > first.time) speed = (-(latest.x - first.x) / (latest.time - first.time)) * 1000 / gap;
      }
      speed = clamp(speed, -MAX_FLING, MAX_FLING);

      // Carry on with that speed (inertia) and see which group it would stop nearest to.
      let next = Math.round(pos + speed * 0.2);
      const dragged = pos - p.startPos;
      if (Math.abs(speed) * gap > FLICK_SPEED) {
        // A clear flick always moves on at least one group in that direction.
        next = speed > 0 ? Math.max(next, Math.floor(pos) + 1) : Math.min(next, Math.ceil(pos) - 1);
      } else if (Math.abs(dragged) * gap > Math.min(gap * 0.22, 90)) {
        // A slow but deliberate drag also moves on, without having to pull past halfway.
        next = dragged > 0 ? Math.max(next, Math.ceil(pos)) : Math.min(next, Math.floor(pos));
      }
      const here = Math.round(pos);
      springTo(clamp(next, here - 2, here + 2), speed);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    /** A click on a side group brings it to the middle. (A click on the middle group opens the panel.) */
    const onClick = (event: MouseEvent) => {
      if (gap === 0 || (event.target as Element).closest(".ons-slide[data-active] .ons-cluster")) return;
      const box = stage.getBoundingClientRect();
      const fromMiddle = event.clientX - (box.left + box.width / 2);
      if (Math.abs(fromMiddle) > gap - groupWidth * NEIGHBOUR_SCALE * 0.5 - 8) api.current?.go(fromMiddle > 0 ? 1 : -1);
    };

    // ---- Trackpad: sideways scroll only -----------------------------------
    let wheelTimer = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || gap === 0 || dragging()) return;
      // Up/down (a mouse wheel, or a vertical trackpad scroll) is NOT ours: the page scrolls as usual.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const pixels = event.deltaMode === 1 ? event.deltaX * 32 : event.deltaX;
      pos += clamp(pixels, -gap * 0.5, gap * 0.5) / gap;
      mode = "wheel";
      wake();
      // When the scrolling stops, settle on the nearest group.
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        if (mode === "wheel") springTo(Math.round(pos + vel * 0.12));
      }, 110);
    };

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);
    stage.addEventListener("click", onClickCapture, true);
    stage.addEventListener("click", onClick);
    carousel.addEventListener("wheel", onWheel, { passive: false });

    // Re-measure when the screen changes size or turns (also fires once at the start).
    const resizeObserver = new ResizeObserver(() => {
      if (measure()) render();
    });
    resizeObserver.observe(stage);
    if (measure()) render();

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(wheelTimer);
      resizeObserver.disconnect();
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerEnd);
      stage.removeEventListener("pointercancel", onPointerEnd);
      stage.removeEventListener("click", onClickCapture, true);
      stage.removeEventListener("click", onClick);
      carousel.removeEventListener("wheel", onWheel);
      stage.removeAttribute("data-dragging");
      api.current = null;
    };
  }, [carouselRef]);

  /** Move on by `step` groups (1 = next, -1 = previous). */
  const go = useCallback((step: number) => api.current?.go(step), []);
  /** Bring group number `index` to the middle, the shortest way round. */
  const goTo = useCallback((index: number) => api.current?.goTo(index), []);
  return { go, goTo };
}
