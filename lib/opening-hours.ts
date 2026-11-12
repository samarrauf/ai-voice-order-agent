// Is the restaurant open right now, in its own timezone (Europe/London)?
//
// opening_hours shape (from seed.sql):
//   { "mon": [{ "open": "16:00", "close": "23:00" }], ... }
// A close of "00:00" means midnight at the end of that day. A close earlier
// than the open (e.g. 18:00–02:00) runs past midnight into the next day.

import { numberToWords } from "@/lib/speech";

type Range = { open: string; close: string };
export type OpeningHours = Partial<Record<DayKey, Range[]>>;

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAYS)[number];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Day index (0 = Sunday) and minutes past midnight, in the given timezone. */
function localNow(timeZone: string, now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = DAYS.indexOf(get("weekday").toLowerCase().slice(0, 3) as DayKey);
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "16:00" -> "four", "16:30" -> "four thirty", "12:00" -> "twelve noon". */
export function timeForSpeech(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 12 && m === 0) return "twelve noon";
  if (h === 0 && m === 0) return "midnight";
  const hour = numberToWords(h % 12 === 0 ? 12 : h % 12);
  if (m === 0) return hour;
  return `${hour} ${m < 10 ? `oh ${numberToWords(m)}` : numberToWords(m)}`;
}

/**
 * Clock-style speech for times the caller hears.
 * "16:00" -> "four o'clock", "16:15" -> "quarter past four", "16:30" -> "half past four",
 * "16:45" -> "quarter to five", "16:20" -> "four twenty".
 */
export function clockForSpeech(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour12 = (x: number) => numberToWords(x % 12 === 0 ? 12 : x % 12);
  if (m === 0) {
    if (h === 12) return "twelve noon";
    if (h === 0) return "midnight";
    return `${hour12(h)} o'clock`;
  }
  if (m === 15) return `quarter past ${hour12(h)}`;
  if (m === 30) return `half past ${hour12(h)}`;
  if (m === 45) return `quarter to ${hour12(h + 1)}`;
  return timeForSpeech(hhmm);
}

// ---------------------------------------------------------------------------
// Real instants from restaurant wall-clock times (DST-safe).

/** How far ahead of UTC the timezone is at that instant, in ms (London: 0 or 3,600,000). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local calendar date at an instant: year, month (1-12), day. */
function localDate(timeZone: string, at: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

/** Local wall-clock time on a local date -> the real instant. Day overflow (d + 1) is fine. */
export function zonedToUtc(y: number, m: number, d: number, hhmm: string, timeZone: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(timeZone, new Date(guess));
  const second = guess - tzOffsetMs(timeZone, new Date(first));
  return new Date(second);
}

/** "" for today, "tomorrow at " for tomorrow, "on Friday at " otherwise. */
function dayPrefix(daysAhead: number, y: number, m: number, d: number): string {
  if (daysAhead === 0) return "";
  if (daysAhead === 1) return "tomorrow at ";
  const weekday = new Date(Date.UTC(y, m - 1, d + daysAhead)).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `on ${weekday} at `;
}

export type NextOpening = { at: Date; hhmm: string; daysAhead: number; spoken: string };

/** The next time the restaurant opens strictly after `now`, or null if it has no hours in the next week. */
export function nextOpening(hours: OpeningHours | null, timeZone: string, now = new Date()): NextOpening | null {
  if (!hours) return null;
  const { y, m, d } = localDate(timeZone, now);
  for (let k = 0; k <= 7; k++) {
    const weekday = new Date(Date.UTC(y, m - 1, d + k)).getUTCDay();
    const ranges = (hours[DAYS[weekday]] ?? []).slice().sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
    for (const r of ranges) {
      const at = zonedToUtc(y, m, d + k, r.open, timeZone);
      if (at.getTime() > now.getTime()) {
        return { at, hhmm: r.open, daysAhead: k, spoken: `${dayPrefix(k, y, m, d)}${clockForSpeech(r.open)}` };
      }
    }
  }
  return null;
}

export type RequestedTime = { at: Date; hhmm: string; daysAhead: number; spoken: string };

/**
 * "16:15" (restaurant local time) -> the next 16:15 that is after `now`.
 * The agent only ever sends a wall-clock time; the server works out the date,
 * so the model never does timezone or date maths.
 */
export function resolveRequestedTime(hhmm: string, timeZone: string, now = new Date()): RequestedTime {
  const { y, m, d } = localDate(timeZone, now);
  let daysAhead = 0;
  let at = zonedToUtc(y, m, d, hhmm, timeZone);
  if (at.getTime() <= now.getTime()) {
    daysAhead = 1;
    at = zonedToUtc(y, m, d + 1, hhmm, timeZone);
  }
  return { at, hhmm, daysAhead, spoken: `${dayPrefix(daysAhead, y, m, d)}${clockForSpeech(hhmm)}` };
}

/** Restaurant local time now, e.g. { weekday: "Thursday", hhmm: "14:05" }. */
export function localClock(timeZone: string, now = new Date()): { weekday: string; hhmm: string } {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long", timeZone });
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return { weekday, hhmm };
}

export type OpenCheck = { open: true } | { open: false; speech: string };

export function checkOpen(hours: OpeningHours | null, timeZone: string, now = new Date()): OpenCheck {
  if (!hours) {
    return { open: false, speech: "Sorry, we're not taking orders right now." };
  }
  const { day, minutes } = localNow(timeZone, now);
  const today = hours[DAYS[day]] ?? [];
  const yesterday = hours[DAYS[(day + 6) % 7]] ?? [];

  for (const r of today) {
    const open = toMinutes(r.open);
    const close = toMinutes(r.close);
    // close "00:00" = end of day; close < open = runs past midnight (open until 24:00 today).
    const end = close === 0 || close <= open ? 24 * 60 : close;
    if (minutes >= open && minutes < end) return { open: true };
  }
  // Late-night spill-over from yesterday's range (e.g. Fri 18:00–02:00 covers Sat 01:00).
  for (const r of yesterday) {
    const open = toMinutes(r.open);
    const close = toMinutes(r.close);
    if (close !== 0 && close <= open && minutes < close) return { open: true };
  }

  const laterToday = today
    .filter((r) => toMinutes(r.open) > minutes)
    .sort((a, b) => toMinutes(a.open) - toMinutes(b.open))[0];
  if (laterToday) {
    return { open: false, speech: `Sorry, we're closed right now. We open at ${timeForSpeech(laterToday.open)}.` };
  }
  const tomorrow = (hours[DAYS[(day + 1) % 7]] ?? [])
    .slice()
    .sort((a, b) => toMinutes(a.open) - toMinutes(b.open))[0];
  if (tomorrow) {
    return { open: false, speech: `Sorry, we're closed now. We open tomorrow at ${timeForSpeech(tomorrow.open)}.` };
  }
  return { open: false, speech: "Sorry, we're closed right now." };
}
