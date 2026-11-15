"use client";

import { useSyncExternalStore } from "react";

// Today's date for the header, e.g. "Sunday, 15 November 2026". It is worked
// out in the browser (not on the server) because this Next.js setup does not
// allow reading the clock while it prepares a page ahead of time.
// A fixed time zone so the date matches the restaurant, wherever the device is.
const today = () =>
  new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

const subscribe = () => () => {};

export function TodayDate() {
  // Empty on the server, the real date once the page is running in the browser.
  const date = useSyncExternalStore(subscribe, today, () => "");
  return <>{date || " "}</>;
}
