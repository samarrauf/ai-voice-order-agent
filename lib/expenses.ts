import { z } from "zod";
import { localParts, zonedMidnight, type RangeKey } from "@/lib/dashboard-stats";
import { maxAmountFor } from "@/lib/money";

// Expenses (B2, capability manage_expenses = owner). Validation and date ranges.
// Pure module (no server imports): unit-testable without the network.
// An expense is never deleted: it is voided with a reason (migration 0025).

export const PAID_FROM = ["drawer_cash", "bank", "other"] as const;
export type PaidFrom = (typeof PAID_FROM)[number];
export const PAID_FROM_LABELS: Record<PaidFrom, string> = { drawer_cash: "Cash drawer", bank: "Bank", other: "Other" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that is a real calendar date. */
export const isDateKey = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

const dateKey = z.string().refine(isDateKey, "date must be YYYY-MM-DD");

export function expenseActionSchema(currency?: string | null) {
  const amount = z
    .number("amount must be a number")
    .finite()
    .gt(0, "amount must be more than 0")
    .max(maxAmountFor(currency), "amount is too high")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "amount can have at most two decimals");
  const base = { restaurant_id: z.guid().optional() };
  return z.discriminatedUnion("action", [
    z
      .object({
        ...base,
        action: z.literal("add"),
        expense_date: dateKey,
        category_id: z.guid(),
        description: z.string().trim().max(200, "description is too long (max 200)").default(""),
        amount,
        paid_from: z.enum(PAID_FROM),
      })
      .strict(),
    z.object({ ...base, action: z.literal("void"), id: z.guid(), reason: z.string().trim().min(1, "a reason is required").max(200) }).strict(),
    z.object({ ...base, action: z.literal("category_add"), name: z.string().trim().min(1, "name is required").max(60) }).strict(),
  ]);
}
export type ExpenseAction = z.infer<ReturnType<typeof expenseActionSchema>>;

// ---------------------------------------------------------------------------
// Dates, always in the restaurant's own timezone.

export const toDateKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parseKey = (k: string) => k.split("-").map(Number) as [number, number, number];
export function addDays(key: string, days: number): string {
  const [y, m, d] = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toDateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Today's date in the restaurant's timezone. */
export function todayKey(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone);
  return toDateKey(p.y, p.m, p.d);
}

export type ProfitRange = { from: Date; to: Date; fromDate: string; toDateExclusive: string };

/** Whole local days fromDate..toDate (both included): orders [from, to), expenses [fromDate, toDateExclusive). */
export function rangeForDates(fromDate: string, toDate: string, timeZone: string): ProfitRange {
  const toDateExclusive = addDays(toDate, 1);
  return {
    from: zonedMidnight(...parseKey(fromDate), timeZone),
    to: zonedMidnight(...parseKey(toDateExclusive), timeZone),
    fromDate,
    toDateExclusive,
  };
}

/** The Expenses page filter: defaults to this month so far; a reversed range is swapped. */
export function expenseFilter(params: { from?: string; to?: string; category?: string }, now: Date, timeZone: string) {
  const today = todayKey(now, timeZone);
  let from = isDateKey(params.from) ? params.from : `${today.slice(0, 8)}01`;
  let to = isDateKey(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const category = params.category && z.guid().safeParse(params.category).success ? params.category : null;
  return { from, to, category };
}

/** The Home range pills as whole days (today / last 7 days / this month), up to now. */
export function rangeForHome(range: RangeKey, now: Date, timeZone: string): ProfitRange {
  const today = todayKey(now, timeZone);
  const fromDate = range === "today" ? today : range === "7d" ? addDays(today, -6) : `${today.slice(0, 8)}01`;
  return { ...rangeForDates(fromDate, today, timeZone), to: now };
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Electricity",
  "Gas",
  "Ingredients",
  "Packaging",
  "Fuel/Delivery",
  "Maintenance",
  "Marketing",
  "Other",
] as const;
