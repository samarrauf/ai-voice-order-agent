// Home dashboard numbers. THE one place that turns order rows into figures; the
// Reports page (B5) must use these same functions so both always agree.
// Pure module: no React, no server imports, no network (tests/dashboard-stats.pure.test.ts).
//
// SALES RULE (used everywhere, do not change it in one place only):
//   Sales = total - tax_amount - (refunds without their tax share), and cancelled (and
//   merged) orders are left out (B4b: refundSalesPence in lib/order-adjust.ts).
// So tax collected for the taxman is never counted as the restaurant's income,
// while the service charge, delivery fee and discount stay as the bill has them.
// Money is added in whole pence (integers), so 0.1 + 0.2 style drift cannot happen.
//
// Periods follow the RESTAURANT's time zone, not the server's or the browser's.
// "Today" starts at local midnight (business_day_start comes later, in B5).

import { refundSalesPence } from "@/lib/order-adjust";

export const RANGE_KEYS = ["today", "7d", "month"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_LABELS: Record<RangeKey, string> = { today: "Today", "7d": "7 days", month: "This month" };
/** The text after "vs" in a KPI badge ("12% vs yesterday"). */
export const RANGE_VERSUS: Record<RangeKey, string> = { today: "yesterday", "7d": "previous 7 days", month: "last month" };

export const isRangeKey = (v: unknown): v is RangeKey => typeof v === "string" && (RANGE_KEYS as readonly string[]).includes(v);

/** Orders that still need the kitchen or the counter. */
/** Orders that never count as a sale: cancelled, and the source order of a merge (its items moved to another order). */
export const isExcludedStatus = (status: string): boolean => status === "cancelled" || status === "merged";

export const OPEN_STATUSES = ["new", "accepted", "preparing", "ready"] as const;

export type StatsOrder = {
  status: string;
  fulfilment_type: string;
  source: string;
  table_session_id: string | null;
  total: number;
  tax_amount: number;
  paid_amount: number;
  /** Sum of refunds (B4b, migration 0029). Missing = 0. */
  refunded_amount?: number;
  created_at: string;
};
export type StatsItem = { item_name: string; quantity: number };

const toPence = (amount: unknown): number => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Sales of one order in pence (the SALES RULE above); 0 for a cancelled order. */
export function orderSalesPence(o: Pick<StatsOrder, "status" | "total" | "tax_amount" | "refunded_amount">): number {
  if (isExcludedStatus(o.status)) return 0;
  // A refund comes off net sales (its tax share taken out the same way as the bill).
  return Math.max(0, toPence(o.total) - toPence(o.tax_amount) - refundSalesPence(o));
}

// ---------- time zones ----------

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    } catch {
      f = formatterFor("Europe/London"); // an unknown zone in the database must never crash the page
    }
    formatters.set(timeZone, f);
  }
  return f;
}

export type LocalParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

/** Calendar date and clock time of `date` in `timeZone`. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

/** Milliseconds `timeZone` is ahead of UTC at instant `t`. */
function offsetAt(t: number, timeZone: string): number {
  const p = localParts(new Date(t), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** The instant of local 00:00 on y-m-d in `timeZone` (works across daylight saving changes). */
export function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetAt(guess, timeZone);
  const again = offsetAt(t, timeZone);
  if (guess - again !== t) t = guess - again;
  return new Date(t);
}

function shiftDay(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}
const dayKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export type Period = {
  /** Current period: [start, end). `end` is "now". */
  start: Date;
  end: Date;
  /** The equally long period just before it, used for the % change badges. */
  prevStart: Date;
  prevEnd: Date;
};

/**
 * today = since local midnight (compared with yesterday up to the same time);
 * 7d = the last 7 local days including today (compared with the 7 before);
 * month = since the 1st (compared with the same stretch of last month).
 */
export function periodFor(range: RangeKey, now: Date, timeZone: string): Period {
  const p = localParts(now, timeZone);
  if (range === "today") {
    const start = zonedMidnight(p.y, p.m, p.d, timeZone);
    const y = shiftDay(p.y, p.m, p.d, -1);
    const prevStart = zonedMidnight(y.y, y.m, y.d, timeZone);
    return { start, end: now, prevStart, prevEnd: new Date(prevStart.getTime() + (now.getTime() - start.getTime())) };
  }
  if (range === "7d") {
    const s = shiftDay(p.y, p.m, p.d, -6);
    const ps = shiftDay(p.y, p.m, p.d, -13);
    const start = zonedMidnight(s.y, s.m, s.d, timeZone);
    return { start, end: now, prevStart: zonedMidnight(ps.y, ps.m, ps.d, timeZone), prevEnd: start };
  }
  const start = zonedMidnight(p.y, p.m, 1, timeZone);
  const py = p.m === 1 ? p.y - 1 : p.y;
  const pm = p.m === 1 ? 12 : p.m - 1;
  const prevStart = zonedMidnight(py, pm, 1, timeZone);
  // Same stretch of last month, but never beyond the start of this month (last month may be shorter).
  const prevEnd = new Date(Math.min(prevStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  return { start, end: now, prevStart, prevEnd };
}

// ---------- totals ----------

export type Totals = { orders: number; salesPence: number; averagePence: number; paidPence: number; billedPence: number };

const inside = (o: StatsOrder, from: Date, to: Date) => {
  const t = Date.parse(o.created_at);
  return t >= from.getTime() && t < to.getTime();
};

/** Counts and sums for orders created in [from, to). Cancelled orders are left out of everything. */
export function totalsFor(orders: readonly StatsOrder[], from: Date, to: Date): Totals {
  let count = 0;
  let sales = 0;
  let paid = 0;
  let billed = 0;
  for (const o of orders) {
    if (isExcludedStatus(o.status) || !inside(o, from, to)) continue;
    const total = toPence(o.total);
    count += 1;
    sales += orderSalesPence(o);
    billed += Math.max(0, total - toPence(o.refunded_amount ?? 0)); // money given back is no longer billed
    paid += Math.min(Math.max(0, toPence(o.paid_amount)), total); // an overpayment never lifts the gauge past 100%
  }
  return { orders: count, salesPence: sales, averagePence: count ? Math.round(sales / count) : 0, paidPence: paid, billedPence: billed };
}

/**
 * % change from `previous` to `current`, whole number.
 * previous = 0: no change if current is 0 too, otherwise null (an infinite
 * jump has no sensible percentage; callers show "new" or a plain note).
 */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Whole-number percentages of `values` that add up to exactly 100 (largest remainder). All 0 when the total is 0. */
export function sharePercents(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => 0);
  const exact = clean.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, rem: e - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (clean[i] > 0) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors;
}

// ---------- order type, donut ----------

export type OrderType = "dine_in" | "takeaway" | "delivery";
export const ORDER_TYPE_LABELS: Record<OrderType, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };

/** Dine-in = seated at a table (table session or a table booking); else delivery or takeaway (pickup). */
export function orderTypeOf(o: Pick<StatsOrder, "fulfilment_type" | "source" | "table_session_id">): OrderType {
  if (o.table_session_id || o.source === "table_booking") return "dine_in";
  return o.fulfilment_type === "delivery" ? "delivery" : "takeaway";
}

export type TypeShare = { type: OrderType; label: string; count: number; percent: number };

/** How many orders of each type in [from, to), with whole percentages adding up to 100 (all 0 when empty). */
export function typeShares(orders: readonly StatsOrder[], from: Date, to: Date): TypeShare[] {
  const counts: Record<OrderType, number> = { dine_in: 0, takeaway: 0, delivery: 0 };
  for (const o of orders) if (!isExcludedStatus(o.status) && inside(o, from, to)) counts[orderTypeOf(o)] += 1;
  const types: OrderType[] = ["dine_in", "takeaway", "delivery"];
  const pct = sharePercents(types.map((t) => counts[t]));
  return types.map((type, i) => ({ type, label: ORDER_TYPE_LABELS[type], count: counts[type], percent: pct[i] }));
}

// ---------- top items ----------

export type TopItem = { name: string; quantity: number };

/** The `limit` best sellers by quantity (same name in any letter case counts once). Ties: alphabetical. */
export function topItems(items: readonly StatsItem[], limit = 5): TopItem[] {
  const map = new Map<string, TopItem>();
  for (const it of items) {
    const name = String(it.item_name ?? "").trim();
    const q = Number(it.quantity);
    if (!name || !Number.isFinite(q) || q <= 0) continue;
    const key = name.toLowerCase();
    const hit = map.get(key);
    if (hit) hit.quantity += q;
    else map.set(key, { name, quantity: q });
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, limit);
}

// ---------- chart series ----------

export type SeriesPoint = {
  key: string;
  /** Short axis label ("14", "Mon", "21"). */
  label: string;
  /** Longer text for the tooltip ("14:00", "Mon 21 Nov"). */
  title: string;
  salesPence: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Today's chart always covers these opening hours; busier hours outside them widen it.
const DAY_FROM_HOUR = 10;
const DAY_TO_HOUR = 22;

/**
 * Sales per bucket: per hour for "today" (hours of the restaurant's local day, trimmed to
 * 10-22 unless orders fall outside), per day for "7d" and "month". Buckets follow the
 * restaurant's time zone: an order at 23:30 UTC is already "tomorrow" in Karachi.
 */
export function salesSeries(orders: readonly StatsOrder[], range: RangeKey, period: Period, timeZone: string, now: Date = period.end): SeriesPoint[] {
  const current = orders.filter((o) => !isExcludedStatus(o.status) && inside(o, period.start, period.end));
  if (range === "today") {
    const byHour = new Array<number>(24).fill(0);
    let first = DAY_FROM_HOUR;
    let last = DAY_TO_HOUR;
    for (const o of current) {
      const h = localParts(new Date(o.created_at), timeZone).h;
      byHour[h] += orderSalesPence(o);
      first = Math.min(first, h);
      last = Math.max(last, h);
    }
    const out: SeriesPoint[] = [];
    for (let h = first; h <= last; h++) {
      out.push({ key: String(h), label: String(h).padStart(2, "0"), title: `${String(h).padStart(2, "0")}:00`, salesPence: byHour[h] });
    }
    return out;
  }
  const today = localParts(now, timeZone);
  const days: { y: number; m: number; d: number }[] = [];
  if (range === "7d") {
    for (let i = 6; i >= 0; i--) days.push(shiftDay(today.y, today.m, today.d, -i));
  } else {
    for (let d = 1; d <= today.d; d++) days.push({ y: today.y, m: today.m, d });
  }
  const sums = new Map(days.map((x) => [dayKey(x.y, x.m, x.d), 0]));
  for (const o of current) {
    const p = localParts(new Date(o.created_at), timeZone);
    const k = dayKey(p.y, p.m, p.d);
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + orderSalesPence(o));
  }
  return days.map((x) => {
    const wd = WEEKDAYS[new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay()];
    return {
      key: dayKey(x.y, x.m, x.d),
      label: range === "7d" ? wd : String(x.d),
      title: `${wd} ${x.d} ${MONTHS[x.m - 1]}`,
      salesPence: sums.get(dayKey(x.y, x.m, x.d)) ?? 0,
    };
  });
}

// ---------- everything the reports part of Home needs ----------

export type SalesReport = {
  current: Totals;
  previous: Totals;
  /** % change vs the previous period; null = previous was 0 and current is not. */
  change: { sales: number | null; orders: number | null; average: number | null };
  series: SeriesPoint[];
  types: TypeShare[];
  topItems: TopItem[];
  /** Share of the billed total already paid (0-100), plus the pence behind it. */
  collected: { percent: number; paidPence: number; billedPence: number };
};

/**
 * `orders` must cover prevStart..end; `items` are the lines of the CURRENT period's orders.
 * (Both are fetched by lib/dashboard-home.ts.)
 */
export function buildSalesReport(input: {
  orders: readonly StatsOrder[];
  items: readonly StatsItem[];
  range: RangeKey;
  now: Date;
  timeZone: string;
}): SalesReport {
  const period = periodFor(input.range, input.now, input.timeZone);
  const current = totalsFor(input.orders, period.start, period.end);
  const previous = totalsFor(input.orders, period.prevStart, period.prevEnd);
  const percent = current.billedPence > 0 ? Math.min(100, Math.round((current.paidPence / current.billedPence) * 100)) : 0;
  return {
    current,
    previous,
    change: {
      sales: pctChange(current.salesPence, previous.salesPence),
      orders: pctChange(current.orders, previous.orders),
      average: pctChange(current.averagePence, previous.averagePence),
    },
    series: salesSeries(input.orders, input.range, period, input.timeZone, input.now),
    types: typeShares(input.orders, period.start, period.end),
    topItems: topItems(input.items),
    collected: { percent, paidPence: current.paidPence, billedPence: current.billedPence },
  };
}

/** Pence -> money units for formatMoney (the only place pence turn back into a decimal amount). */
export const penceToAmount = (pence: number): number => pence / 100;

/** "just now", "5 min ago", "3 h ago", "2 d ago" for the live order list. */
export function timeAgo(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} h ago`;
  return `${Math.floor(mins / (60 * 24))} d ago`;
}

/** Order status -> how far along it is (0-100), for the small bar in the live list. */
export const STATUS_PROGRESS: Record<string, number> = { new: 20, accepted: 40, preparing: 65, ready: 85, completed: 100, cancelled: 0, merged: 0 };
