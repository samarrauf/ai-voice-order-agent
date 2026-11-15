"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "../wordmark";

// The short opening moment: a dark olive curtain with the wordmark, which
// lifts after about two seconds to reveal the hero.
//
// It plays ONCE per visit:
//   - First load in this browser tab: plays.
//   - Refresh / coming back later in the same tab: skipped. A tiny inline
//     script checks sessionStorage before the page paints, so there is no
//     flash (this is the pattern from the Next.js "preventing flash" guide).
//   - Moving between pages and back to Home without a reload: skipped,
//     remembered by the `played` variable below.
// With reduced motion switched on it never shows (see olive.css).

let played = false; // true once the intro has been shown since the last full page load

const SEEN_SCRIPT = `(function(){try{var e=document.getElementById("ons-intro");if(!e)return;if(sessionStorage.getItem("ons-intro")){e.setAttribute("data-seen","")}else{sessionStorage.setItem("ons-intro","1")}}catch(_){}})()`;

export function HeroIntro() {
  const [done, setDone] = useState(() => played);

  useEffect(() => {
    played = true;
    try {
      sessionStorage.setItem("ons-intro", "1");
    } catch {
      // Private mode can block storage; the intro then simply plays again next time.
    }
  }, []);

  if (done) return null;

  return (
    <>
      <div
        id="ons-intro"
        className="ons-intro ons-on-dark"
        aria-hidden="true"
        suppressHydrationWarning
        onAnimationEnd={(event) => {
          if (event.animationName === "ons-intro-out") setDone(true);
        }}
      >
        <div className="ons-intro-inner">
          <Wordmark size="lg" showGroup />
          <span className="ons-intro-line" />
        </div>
      </div>
      {/* Runs while the page is still loading; ignored on in-app navigation. */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }}
      />
    </>
  );
}
