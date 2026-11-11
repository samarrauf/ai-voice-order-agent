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
