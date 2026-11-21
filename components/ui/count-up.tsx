"use client";

import { useEffect, useRef, useState } from "react";
import { COUNT_DURATION_MS, countFrame, motionAllowed } from "@/lib/count-up";
import { formatMoney } from "@/lib/money";

/**
 * A number that counts up from 0 (900ms, requestAnimationFrame). With reduced
 * motion or Lite mode it shows the final figure at once. The server renders the
 * final figure too, so nothing is wrong without JavaScript.
 * `currency` formats it as money (lib/money.ts); otherwise a whole number.
 * When `value` changes later (a refresh) it counts from the old figure to the new one.
 */
export function CountUp({
  value,
  currency,
  suffix,
  duration = COUNT_DURATION_MS,
  className,
}: {
  value: number;
  currency?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const last = useRef<number | null>(null);

  useEffect(() => {
    const from = last.current ?? 0;
    last.current = value;
    const animate = motionAllowed({
      prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      lite: document.documentElement.hasAttribute("data-lite"),
    });
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      setShown(countFrame({ elapsed: now - start, duration, from, to: value, animate }));
      if (animate && now - start < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const format = (n: number) => (currency ? formatMoney(n, currency) : Math.round(n).toLocaleString("en-GB")) + (suffix ?? "");
  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}
