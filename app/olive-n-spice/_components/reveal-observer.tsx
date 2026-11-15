"use client";

import { useEffect } from "react";

// Gentle "fade up" as sections scroll into view.
//
// Any element with the attribute `data-reveal` takes part. This helper
// renders nothing. It uses the browser's own animation engine (Web
// Animations API) and never changes the page's HTML, so:
//   - content is fully visible if JavaScript is off or fails,
//   - whatever is already on screen when the page opens is left alone,
//   - only things further down fade up when you scroll to them.
// `--reveal-delay` (set inline on an element) staggers neighbours.
// With "reduce motion" switched on, nothing animates at all.

const KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translate3d(0, 26px, 0)" },
  { opacity: 1, transform: "none" },
];

export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector(".ons");
    if (!root || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const waiting = new WeakMap<Element, Animation>();
    const held = new Set<Animation>(); // animations still holding an element hidden

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          const animation = waiting.get(entry.target);
          if (!animation) continue;
          animation.play();
          // When done, hand the element back to its normal styles.
          animation.finished
            .then(() => {
              animation.cancel();
              held.delete(animation);
            })
            .catch(() => {});
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );

    const scan = () => {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) return; // on screen (or above it) already: leave it alone
        const delay = parseFloat(getComputedStyle(el).getPropertyValue("--reveal-delay")) || 0;
        const animation = el.animate(KEYFRAMES, {
          duration: 900,
          delay,
          easing: "cubic-bezier(0.22, 0.8, 0.2, 1)",
          fill: "both",
        });
        animation.pause(); // holds the hidden first frame until the element scrolls in
        waiting.set(el, animation);
        held.add(animation);
        io.observe(el);
      });
    };
    scan();

    // Moving between pages swaps the content; look again whenever it changes.
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      // Never leave anything hidden behind.
      held.forEach((animation) => animation.cancel());
      held.clear();
    };
  }, []);

  return null;
}
