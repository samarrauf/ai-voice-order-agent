import { z } from "zod";

// Tables & venue (P3a): validation and the pure rules. No server imports, so tests and
// client components can use it. The database work is in lib/tables-data.ts.

export const MAX_SEATS = 50; // same ceiling as a party size (lib/booking.ts MAX_PARTY_SIZE)
export const MAX_BULK = 200; // most tables one bulk add may create
export const MAX_TABLE_NUMBER = 9999;
/** A confirmed booking holds its table for this long (the 90 minutes of find_free_table). */
export const BOOKING_MINUTES = 90;
/** A booking this close counts as "reserved soon" on the live floor. */
export const SOON_MINUTES = 60;

const noControlChars = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);

const tableNumber = z.string().trim().min(1).max(20).refine(noControlChars, "no control characters");
const seats = z.number().int().min(1).max(MAX_SEATS);
const sectionName = z.string().trim().min(1).max(40).refine(noControlChars, "no control characters");
const notes = z
  .string()
  .trim()
  .max(200)
  .refine(noControlChars, "no control characters")
  .transform((s) => (s === "" ? null : s));
const id = z.guid();

export const tableActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("section_add"), name: sectionName }),
  z.object({ action: z.literal("section_rename"), id, name: sectionName }),
  z.object({ action: z.literal("section_reorder"), ids: z.array(id).min(1).max(100) }),
  z.object({ action: z.literal("section_set_active"), id, is_active: z.boolean() }),
  z.object({
    action: z.literal("table_add"),
    table_number: tableNumber,
    seats,
    section_id: id.nullish(),
    notes: notes.nullish(),
  }),
  z
    .object({
      action: z.literal("table_bulk_add"),
      prefix: z.string().trim().max(10).refine(noControlChars, "no control characters").default(""),
      from: z.number().int().min(1).max(MAX_TABLE_NUMBER),
      to: z.number().int().min(1).max(MAX_TABLE_NUMBER),
      seats,
      section_id: id.nullish(),
    })
    .refine((b) => b.to >= b.from, { path: ["to"], message: "must be the same as or bigger than from" })
    .refine((b) => b.to - b.from + 1 <= MAX_BULK, { path: ["to"], message: `at most ${MAX_BULK} tables at a time` }),
  z.object({
    action: z.literal("table_update"),
    id,
    table_number: tableNumber.optional(),
    seats: seats.optional(),
    section_id: id.nullish().optional(),
    notes: notes.nullish().optional(),
  }),
  z.object({ action: z.literal("table_set_active"), id, is_active: z.boolean() }),
]);

export type TableAction = z.infer<typeof tableActionSchema>;

/** Bulk add: prefix "T", 1..4 -> T1, T2, T3, T4. */
export function bulkNumbers(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${prefix}${n}`);
  return out;
}

// ---------- restaurant clock ----------

/** The restaurant's local date ("2031-04-01") and minutes since midnight at `now`. */
export function restaurantNow(timeZone: string, now: Date): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return restaurantNow("Europe/London", now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export type BookingSlot = { booking_date: string; booking_time: string };

/** Minutes from now until the booking starts (negative = it started already). */
export function minutesUntil(b: BookingSlot, local: { date: string; minutes: number }): number {
  const days = Math.round((Date.parse(`${b.booking_date}T00:00:00Z`) - Date.parse(`${local.date}T00:00:00Z`)) / 86_400_000);
  return days * 1440 + toMinutes(b.booking_time) - local.minutes;
}

/** A confirmed booking that still lies ahead or whose 90 minutes are not over yet. */
export function isUpcomingBooking(b: BookingSlot, local: { date: string; minutes: number }): boolean {
  return minutesUntil(b, local) + BOOKING_MINUTES > 0;
}

// ---------- live status ----------

export type LiveState = "free" | "seated" | "reserved";

export type LiveInput = {
  session: { seatedAt: string } | null;
  /** Next upcoming confirmed booking of this table, if any. */
  nextBooking: BookingSlot | null;
};

/** Seated beats reserved beats free. "Reserved" = a booking starting within SOON_MINUTES (or running late). */
export function liveState(t: LiveInput, local: { date: string; minutes: number }): LiveState {
  if (t.session) return "seated";
  if (t.nextBooking && minutesUntil(t.nextBooking, local) <= SOON_MINUTES) return "reserved";
  return "free";
}

/** Whole minutes between two instants, never negative. */
export function minutesSince(iso: string, now: Date): number {
  const ms = now.getTime() - Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : 0;
}

/** 5 -> "5 min", 75 -> "1 h 15 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const m = minutes % 60;
  return m === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${m} min`;
}

/** Natural order of table names: T2 before T10. */
export const compareTableNumbers = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
