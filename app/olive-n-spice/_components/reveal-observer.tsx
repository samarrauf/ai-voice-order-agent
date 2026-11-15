"use client";

import { useEffect } from "react";

// Gentle "fade up" as sections scroll into view.
// Any element with the attribute `data-reveal` starts invisible (see
// olive.css). This tiny helper watches those elements and adds
// `data-visible` the first time each one enters the screen. It renders
// nothing itself. With reduced motion switched on, the CSS shows
// everything straight away and this does no visible work.

export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector(".ons");
    if (!root) return;

    const show = (el: Element) => el.setAttribute("data-visible", "");
    if (!("IntersectionObserver" in window)) {
      root.querySelectorAll("[data-reveal]").forEach(show);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );

    const scan = () => root.querySelectorAll("[data-reveal]:not([data-visible])").forEach((el) => io.observe(el));
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
    };
  }, []);

  return null;
}
