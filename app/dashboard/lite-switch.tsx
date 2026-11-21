"use client";

import { useSyncExternalStore } from "react";
import { LITE_STORAGE_KEY } from "@/lib/lite-mode";

// Lite mode switch (blur and animations off). The page-load script in
// lib/lite-mode.ts sets <html data-lite> before first paint; this reads and
// changes that attribute and remembers the user's choice in localStorage
// (always wrapped in try/catch: storage can be blocked).
const EVENT = "dash-lite-change";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
const read = () => document.documentElement.hasAttribute("data-lite");

export function LiteSwitch() {
  const lite = useSyncExternalStore(subscribe, read, () => false);

  function toggle() {
    const next = !read();
    document.documentElement.toggleAttribute("data-lite", next);
    try {
      localStorage.setItem(LITE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: the choice still applies until the page is reloaded.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={lite}
      onClick={toggle}
      className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 text-sm font-medium text-ink hover:bg-ink/5"
    >
      <span className="text-left">
        Lite mode
        <span className="block text-xs font-normal text-ink-faint">No blur or animation</span>
      </span>
      <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${lite ? "bg-accent" : "bg-ink/20"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all duration-200 ${lite ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
