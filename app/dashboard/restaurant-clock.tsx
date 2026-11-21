"use client";

import { useSyncExternalStore } from "react";

// Wall clock in the restaurant's own time zone (restaurants.timezone), e.g. "18:42".
// Worked out in the browser (this Next.js setup does not allow reading the clock
// while preparing a page); empty on the server. Ticks every 20 seconds.
function format(timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
  try {
    return new Date().toLocaleTimeString("en-GB", { ...options, timeZone });
  } catch {
    // A bad zone name in the database must not break the page.
    return new Date().toLocaleTimeString("en-GB", { ...options, timeZone: "Europe/London" });
  }
}

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 20_000);
  return () => clearInterval(id);
};

export function RestaurantClock({ timeZone, className }: { timeZone: string; className?: string }) {
  const time = useSyncExternalStore(subscribe, () => format(timeZone), () => "");
  return (
    <span className={className} aria-label={time ? `Restaurant time ${time}` : undefined}>
      {time || " "}
    </span>
  );
}
