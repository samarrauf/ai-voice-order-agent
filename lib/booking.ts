import { z } from "zod";
import { clockForSpeech } from "@/lib/opening-hours";
import { numberToWords } from "@/lib/speech";

// Shared by the check-availability and create-booking tool routes.

/** Largest party any table can seat is decided by the database; this is just a sanity cap. */
export const MAX_PARTY_SIZE = 50;

/** "2026-11-20": must be a real calendar date ("2026-02-31" is rejected). */
export const bookingDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  });

/** "19:30" (24h, restaurant wall-clock time). */
export const bookingTimeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const partySizeSchema = z.number().int().min(1).max(MAX_PARTY_SIZE);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ORDINALS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
  "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third",
  "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth",
  "twenty-ninth", "thirtieth", "thirty-first",
];

/** "2026-11-20" -> "Friday the twentieth of November". */
export function dateForSpeech(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} the ${ORDINALS[d]} of ${MONTH_NAMES[m - 1]}`;
}

/** "19:30" -> "half past seven". */
export const timeForBookingSpeech = clockForSpeech;

/** 4 -> "four people", 1 -> "one person". */
export function partyForSpeech(n: number): string {
  return `${numberToWords(n)} ${n === 1 ? "person" : "people"}`;
}

/** "B-2001" -> "B, two-zero-zero-one": digits one by one so text-to-speech doesn't say "two thousand and one". */
export function referenceForSpeech(reference: string): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const [letters, digits = ""] = reference.split("-");
  return `${letters}, ${[...digits].map((c) => words[Number(c)] ?? c).join("-")}`;
}
