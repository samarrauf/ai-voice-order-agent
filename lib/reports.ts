// Reports page (P4): THE one place that turns raw order rows into report figures.
// Pure module: no React, no server imports, no network (tests/reports.pure.test.ts).
// The database loader is lib/reports-data.ts; it only fetches raw rows.
//
// Rules (shared with Home, lib/dashboard-stats.ts, so both always agree):
//   Sales   = total - tax - (refunds without their tax share)  (orderSalesPence)
//   Left out: cancelled and merged orders (isExcludedStatus), voided lines (the loader).
//   Tax collected = tax_amount - the tax share of refunds.
//   Profit  = lib/profit.ts (summarizeProfit), OWNER ONLY: buildReport adds the
//             `profit` part and per-item profit only when `withProfit` is true, so a
//             manager's report object has no cost/profit key anywhere.
// Money is whole pence (integers); pages turn it back with penceToAmount + formatMoney.
//
// Days follow the RESTAURANT's time zone AND its business_day_start (migration 0032):
// with 04:00, an order at 02:30 on Tuesday belongs to Monday's business day.

import {
  isExcludedStatus,
  localParts,
  ORDER_TYPE_LABELS,
  orderSalesPence,
  orderTypeOf,
  pctChange,
  sharePercents,
  type OrderType,
} from "@/lib/dashboard-stats";
import { addDays, isDateKey, toDateKey } from "@/lib/expenses";
import { owedPence, refundSalesPence } from "@/lib/order-adjust";
import { summarizeProfit, type ProfitSummary } from "@/lib/profit";

// ---------------------------------------------------------------------------
// Ranges

export const REPORT_RANGES = ["today", "yesterday", "7d", "30d", "month", "custom"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];
export const REPORT_RANGE_LABELS: Record<ReportRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  month: "This month",
  custom: "Custom",
};
export const isReportRange = (v: unknown): v is ReportRange => typeof v === "string" && (REPORT_RANGES as readonly string[]).includes(v);

/** The longest custom range, in business days (a year and a day). */
export const MAX_CUSTOM_DAYS = 366;

// ---------------------------------------------------------------------------
// Business day

/** "04:00", "04:00:00" (Postgres time) -> minutes after midnight. Anything else -> 0 (midnight). */
export function businessDayMinutes(value: unknown): number {
  const m = typeof value === "string" ? /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Milliseconds `timeZone` is ahead of UTC at instant `t`. */
function offsetAt(t: number, timeZone: string): number {
  const p = localParts(new Date(t), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

const parseKey = (k: string) => k.split("-").map(Number) as [number, number, number];

/** The instant of local clock time `minutes` on date `key` ("YYYY-MM-DD") in `timeZone` (safe across daylight saving). */
export function zonedTime(key: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = parseKey(key);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetAt(guess, timeZone);
  const again = offsetAt(t, timeZone);
  if (guess - again !== t) t = guess - again;
  return new Date(t);
}

/** The business date ("YYYY-MM-DD") an instant belongs to: before business_day_start it is still the day before. */
export function businessDateOf(at: Date, timeZone: string, dayStartMinutes: number): string {
  const p = localParts(at, timeZone);
  const key = toDateKey(p.y, p.m, p.d);
  return p.h * 60 + p.mi < dayStartMinutes ? addDays(key, -1) : key;
}

/** Number of dates from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  const [a, b] = [parseKey(from), parseKey(to)];
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000) + 1;
}

export type ReportPeriod = {
  range: ReportRange;
  /** Business dates, both included. */
  fromDate: string;
  toDate: string;
  /** Orders: created_at in [start, end). `end` is "now" for a range that runs up to today. */
  start: Date;
  end: Date;
  /** The equally long stretch just before, for the % change badges. */
  prevStart: Date;
  prevEnd: Date;
  prevFromDate: string;
  prevToDate: string;
  /** Text after "vs" ("yesterday", "previous 7 days"). */
  versus: string;
};

/**
 * The period for a range pill (or custom dates), up to `now`.
 *   today      since today's business-day start, vs yesterday up to the same time
 *   yesterday  the whole previous business day, vs the day before
 *   7d / 30d   the last 7 / 30 business days including today, vs the 7 / 30 before
 *   month      since the 1st of this month, vs the same stretch of last month
 *   custom     whole business days from..to (swapped if reversed, never past today,
 *              at most MAX_CUSTOM_DAYS), vs the same number of days just before.
 *              Missing or bad dates fall back to today.
 */
export function reportPeriod(
  input: { range: ReportRange; from?: string | null; to?: string | null },
  now: Date,
  timeZone: string,
  dayStartMinutes: number,
): ReportPeriod {
  const today = businessDateOf(now, timeZone, dayStartMinutes);
  const at = (key: string) => zonedTime(key, dayStartMinutes, timeZone);
  const build = (range: ReportRange, fromDate: string, toDate: string, versus: string): ReportPeriod => {
    const n = daysBetween(fromDate, toDate);
    const start = at(fromDate);
    const fullEnd = at(addDays(toDate, 1));
    const end = new Date(Math.min(fullEnd.getTime(), now.getTime()));
    const prevFromDate = addDays(fromDate, -n);
    const prevToDate = addDays(fromDate, -1);
    const prevStart = at(prevFromDate);
    return { range, fromDate, toDate, start, end, prevStart, prevEnd: start, prevFromDate, prevToDate, versus };
  };

  switch (input.range) {
    case "yesterday": {
      const y = addDays(today, -1);
      return build("yesterday", y, y, "the day before");
    }
    case "7d":
      return build("7d", addDays(today, -6), today, "previous 7 days");
    case "30d":
      return build("30d", addDays(today, -29), today, "previous 30 days");
    case "month": {
      const fromDate = `${today.slice(0, 8)}01`;
      const start = at(fromDate);
      const [y, m] = parseKey(today);
      const prevFromDate = m === 1 ? toDateKey(y - 1, 12, 1) : toDateKey(y, m - 1, 1);
      const prevStart = at(prevFromDate);
      // Same stretch of last month, but never beyond the start of this month (last month may be shorter).
      const prevEnd = new Date(Math.min(prevStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
      return {
        range: "month",
        fromDate,
        toDate: today,
        start,
        end: now,
        prevStart,
        prevEnd,
        prevFromDate,
        prevToDate: businessDateOf(new Date(prevEnd.getTime() - 1), timeZone, dayStartMinutes),
        versus: "same days last month",
      };
    }
    case "custom": {
      let from = isDateKey(input.from) ? input.from : null;
      let to = isDateKey(input.to) ? input.to : null;
      if (!from || !to) return build("custom", today, today, "the day before");
      if (from > to) [from, to] = [to, from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) > MAX_CUSTOM_DAYS) from = addDays(to, -(MAX_CUSTOM_DAYS - 1));
      const n = daysBetween(from, to);
      return build("custom", from, to, n === 1 ? "the day before" : `previous ${n} days`);
    }
    default: {
      const start = at(today);
      const prevFromDate = addDays(today, -1);
      const prevStart = at(prevFromDate);
      return {
        range: "today",
        fromDate: today,
        toDate: today,
        start,
        end: now,
        prevStart,
        prevEnd: new Date(Math.min(prevStart.getTime() + (now.getTime() - start.getTime()), start.getTime())),
        prevFromDate,
        prevToDate: prevFromDate,
        versus: "yesterday",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Raw rows (what lib/reports-data.ts fetches)

type Num = number | string;

export type ReportOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfilment_type: string;
  source: string;
  table_session_id: string | null;
  customer_name?: string | null;
  subtotal: Num;
  discount_amount: Num | null;
  tax_amount: Num | null;
  total: Num;
  paid_amount: Num;
  refunded_amount?: Num | null;
  created_at: string;
  /** OWNER ONLY: the loader selects these two only for view_profit. */
  cost_total?: Num | null;
  cost_complete?: boolean | null;
};

/** One sold (not voided) line of an order in the current period. */
export type ReportItem = {
  order_id: string;
  item_name: string;
  quantity: number;
  line_total: Num;
  /** OWNER ONLY (view_profit). null = cost not set for this line. */
  line_cost?: Num | null;
};

/** A payment or refund row (order_payments) taken during the current period. */
export type ReportPayment = { kind: string; method: string; amount: Num };

const toPence = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const insideRange = (iso: string, from: Date, to: Date) => {
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
};

// ---------------------------------------------------------------------------
// KPIs

export type ReportKpis = {
  salesPence: number;
  orders: number;
  averagePence: number;
  taxPence: number;
  discountPence: number;
};

/** Tax of one order, less the tax share of any refund. 0 for cancelled/merged. */
export function orderTaxPence(o: Pick<ReportOrder, "status" | "total" | "tax_amount" | "refunded_amount">): number {
  if (isExcludedStatus(o.status)) return 0;
  const refunded = Math.min(toPence(o.refunded_amount ?? 0), toPence(o.total));
  const refundTax = refunded - refundSalesPence({ total: o.total, tax_amount: o.tax_amount, refunded_amount: o.refunded_amount });
  return Math.max(0, toPence(o.tax_amount ?? 0) - Math.max(0, refundTax));
}

/** Orders that count (not cancelled/merged) created in [from, to). */
export function countedOrders<T extends Pick<ReportOrder, "status" | "created_at">>(orders: readonly T[], from: Date, to: Date): T[] {
  return orders.filter((o) => !isExcludedStatus(o.status) && insideRange(o.created_at, from, to));
}

export function kpisFor(orders: readonly ReportOrder[], from: Date, to: Date): ReportKpis {
  const list = countedOrders(orders, from, to);
  let sales = 0;
  let tax = 0;
  let discount = 0;
  for (const o of list) {
    sales += orderSalesPence({ status: o.status, total: Number(o.total), tax_amount: Number(o.tax_amount ?? 0), refunded_amount: Number(o.refunded_amount ?? 0) });
    tax += orderTaxPence(o);
    discount += Math.max(0, toPence(o.discount_amount ?? 0));
  }
  return {
    salesPence: sales,
    orders: list.length,
    averagePence: list.length ? Math.round(sales / list.length) : 0,
    taxPence: tax,
    discountPence: discount,
  };
}

const salesOf = (o: ReportOrder) =>
  orderSalesPence({ status: o.status, total: Number(o.total), tax_amount: Number(o.tax_amount ?? 0), refunded_amount: Number(o.refunded_amount ?? 0) });

// ---------------------------------------------------------------------------
// Charts

export type ReportPoint = { key: string; label: string; title: string; salesPence: number; orders: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CORE_FROM_HOUR = 10; // the hourly chart always shows 10:00-22:00; busier hours outside widen it
const CORE_TO_HOUR = 22;

/**
 * Sales per local clock hour over the whole period, in business-day order: with a 04:00
 * start the chart runs 04, 05 ... 23, 00 ... 03. Trimmed to the hours that have orders,
 * but always covering 10-22.
 */
export function hourlySeries(orders: readonly ReportOrder[], from: Date, to: Date, timeZone: string, dayStartMinutes: number): ReportPoint[] {
  const sales = new Array<number>(24).fill(0);
  const count = new Array<number>(24).fill(0);
  for (const o of countedOrders(orders, from, to)) {
    const h = localParts(new Date(o.created_at), timeZone).h;
    sales[h] += salesOf(o);
    count[h] += 1;
  }
  const firstHour = Math.floor(dayStartMinutes / 60);
  const hours = Array.from({ length: 24 }, (_, i) => (firstHour + i) % 24);
  const pos = (h: number) => hours.indexOf(h);
  const busy = hours.map((h, i) => (count[h] > 0 ? i : -1)).filter((i) => i >= 0);
  const lo = Math.min(pos(CORE_FROM_HOUR), pos(CORE_TO_HOUR), ...busy);
  const hi = Math.max(pos(CORE_FROM_HOUR), pos(CORE_TO_HOUR), ...busy);
  // With an odd day start (e.g. 15:00) 10 can come after 22; then simply show the whole day.
  const [a, b] = pos(CORE_FROM_HOUR) <= pos(CORE_TO_HOUR) ? [lo, hi] : [0, 23];
  return hours.slice(a, b + 1).map((h) => {
    const hh = String(h).padStart(2, "0");
    return { key: hh, label: hh, title: `${hh}:00 - ${hh}:59`, salesPence: sales[h], orders: count[h] };
  });
}

/** Sales per business day from fromDate to toDate (both included). */
export function dailySeries(orders: readonly ReportOrder[], period: Pick<ReportPeriod, "fromDate" | "toDate" | "start" | "end">, timeZone: string, dayStartMinutes: number): ReportPoint[] {
  const days: string[] = [];
  for (let k = period.fromDate; k <= period.toDate && days.length <= MAX_CUSTOM_DAYS; k = addDays(k, 1)) days.push(k);
  const sales = new Map(days.map((k) => [k, 0]));
  const count = new Map(days.map((k) => [k, 0]));
  for (const o of countedOrders(orders, period.start, period.end)) {
    const k = businessDateOf(new Date(o.created_at), timeZone, dayStartMinutes);
    if (!sales.has(k)) continue;
    sales.set(k, (sales.get(k) ?? 0) + salesOf(o));
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const short = days.length <= 7;
  return days.map((k) => {
    const [y, m, d] = parseKey(k);
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return { key: k, label: short ? wd : String(d), title: `${wd} ${d} ${MONTHS[m - 1]} ${y}`, salesPence: sales.get(k) ?? 0, orders: count.get(k) ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Top items

export type ReportTopItem = {
  name: string;
  quantity: number;
  /** Line totals (before any whole-order discount). */
  amountPence: number;
  /** OWNER ONLY: (line total - line cost) over the lines whose cost is known. */
  profitPence?: number;
  /** OWNER ONLY: lines of this item whose cost was not set (left out of profitPence). */
  costMissingLines?: number;
};

/**
 * Best sellers by quantity, then amount, then name. Same name in any letter case counts once;
 * the spelling shown is the one sold most (ties: plain text order), so it never depends on row order.
 */
export function topItemsFor(items: readonly ReportItem[], limit: number, withProfit: boolean): ReportTopItem[] {
  const map = new Map<string, { name: string; spellings: Map<string, number>; quantity: number; amount: number; profit: number; missing: number }>();
  for (const it of items) {
    const name = String(it.item_name ?? "").trim();
    const q = Number(it.quantity);
    if (!name || !Number.isFinite(q) || q <= 0) continue;
    const key = name.toLowerCase();
    let row = map.get(key);
    if (!row) map.set(key, (row = { name, spellings: new Map(), quantity: 0, amount: 0, profit: 0, missing: 0 }));
    row.spellings.set(name, (row.spellings.get(name) ?? 0) + q);
    row.quantity += q;
    row.amount += toPence(it.line_total);
    if (withProfit) {
      if (it.line_cost === null || it.line_cost === undefined) row.missing += 1;
      else row.profit += toPence(it.line_total) - toPence(it.line_cost);
    }
  }
  for (const row of map.values()) {
    row.name = [...row.spellings.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
  }
  return [...map.values()]
    .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      quantity: r.quantity,
      amountPence: r.amount,
      ...(withProfit ? { profitPence: r.profit, costMissingLines: r.missing } : {}),
    }));
}

// ---------------------------------------------------------------------------
// Breakdowns

export const PAYMENT_METHODS = ["cash", "card", "online", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", online: "Online", other: "Other" };

export type MethodRow = { method: string; label: string; payments: number; refunds: number; takenPence: number; refundedPence: number; netPence: number };

/** Money taken per payment method during the period: payments minus refunds. */
export function paymentsByMethod(payments: readonly ReportPayment[]): MethodRow[] {
  const rows = new Map<string, MethodRow>();
  const row = (method: string) => {
    let r = rows.get(method);
    if (!r) rows.set(method, (r = { method, label: PAYMENT_METHOD_LABELS[method] ?? method, payments: 0, refunds: 0, takenPence: 0, refundedPence: 0, netPence: 0 }));
    return r;
  };
  for (const m of PAYMENT_METHODS) row(m);
  for (const p of payments) {
    const r = row(String(p.method));
    const amount = Math.max(0, toPence(p.amount));
    if (p.kind === "refund") {
      r.refunds += 1;
      r.refundedPence += amount;
    } else {
      r.payments += 1;
      r.takenPence += amount;
    }
  }
  for (const r of rows.values()) r.netPence = r.takenPence - r.refundedPence;
  return [...rows.values()];
}

/** Known order sources; "whatsapp" is listed ahead of the WhatsApp agent (Phase C). */
export const ORDER_SOURCES = ["phone", "staff_phone", "walk_in", "table_booking", "whatsapp"] as const;
export const SOURCE_LABELS: Record<string, string> = {
  phone: "Phone (AI agent)",
  staff_phone: "Phone (staff)",
  walk_in: "Walk-in / counter",
  table_booking: "Table booking",
  whatsapp: "WhatsApp",
};

export type ShareRow = { key: string; label: string; orders: number; salesPence: number; percent: number };

function shares(keys: readonly string[], labels: Record<string, string>, orders: readonly ReportOrder[], keyOf: (o: ReportOrder) => string, keepEmpty: (k: string) => boolean): ShareRow[] {
  const rows = new Map<string, ShareRow>(keys.map((k) => [k, { key: k, label: labels[k] ?? k, orders: 0, salesPence: 0, percent: 0 }]));
  for (const o of orders) {
    const k = keyOf(o);
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { key: k, label: labels[k] ?? k, orders: 0, salesPence: 0, percent: 0 }));
    r.orders += 1;
    r.salesPence += salesOf(o);
  }
  const list = [...rows.values()].filter((r) => r.orders > 0 || keepEmpty(r.key));
  const pct = sharePercents(list.map((r) => r.salesPence));
  return list.map((r, i) => ({ ...r, percent: pct[i] }));
}

/** Orders and sales per source. WhatsApp only shows once it has orders. */
export function sourceShares(orders: readonly ReportOrder[], from: Date, to: Date): ShareRow[] {
  return shares(ORDER_SOURCES, SOURCE_LABELS, countedOrders(orders, from, to), (o) => o.source, (k) => k !== "whatsapp");
}

/** Orders and sales per type: dine-in, takeaway, delivery. */
export function typeSharesFor(orders: readonly ReportOrder[], from: Date, to: Date): ShareRow[] {
  const types: OrderType[] = ["dine_in", "takeaway", "delivery"];
  return shares(types, ORDER_TYPE_LABELS, countedOrders(orders, from, to), (o) => orderTypeOf(o), () => true);
}

// ---------------------------------------------------------------------------
// Unpaid / part paid

export type UnpaidRow = { id: string; orderNumber: string; customerName: string | null; createdAt: string; type: OrderType; status: string; paymentStatus: string; totalPence: number; owedPence: number };

/** Orders of the period that still owe money (unpaid or part paid), oldest first. */
export function unpaidOrders(orders: readonly ReportOrder[], from: Date, to: Date, limit = 100): { count: number; owedPence: number; orders: UnpaidRow[] } {
  const rows: UnpaidRow[] = [];
  let owed = 0;
  for (const o of countedOrders(orders, from, to)) {
    const due = owedPence({ status: o.status, total: o.total, paid_amount: o.paid_amount, refunded_amount: o.refunded_amount ?? 0 });
    if (due <= 0) continue;
    owed += due;
    rows.push({
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name ?? null,
      createdAt: o.created_at,
      type: orderTypeOf(o),
      status: o.status,
      paymentStatus: o.payment_status,
      totalPence: toPence(o.total),
      owedPence: due,
    });
  }
  rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { count: rows.length, owedPence: owed, orders: rows.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// The whole report

export type ReportProfit = ProfitSummary & { previousNetProfit: number; change: number | null };

export type Report = {
  period: { range: ReportRange; fromDate: string; toDate: string; start: string; end: string; versus: string; dayStart: string };
  kpis: { current: ReportKpis; previous: ReportKpis; change: Record<keyof ReportKpis, number | null> };
  hourly: ReportPoint[];
  daily: ReportPoint[];
  topItems: ReportTopItem[];
  payments: MethodRow[];
  sources: ShareRow[];
  types: ShareRow[];
  unpaid: { count: number; owedPence: number; orders: UnpaidRow[] };
  /** OWNER ONLY (view_profit). Absent for everyone else. */
  profit?: ReportProfit;
};

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * `orders` must cover prevStart..end; `items` and `payments` belong to the current period.
 * `withProfit` = can(role, "view_profit"); when false, nothing about cost or profit is
 * computed or returned, even if the rows happened to carry cost columns.
 */
export function buildReport(input: {
  period: ReportPeriod;
  orders: readonly ReportOrder[];
  items: readonly ReportItem[];
  payments: readonly ReportPayment[];
  timeZone: string;
  dayStartMinutes: number;
  withProfit: boolean;
  /** OWNER ONLY: expense amounts of the current and previous period (not voided). */
  expenses?: { current: readonly Num[]; previous: readonly Num[] };
}): Report {
  const { period, orders, timeZone, dayStartMinutes, withProfit } = input;
  const current = kpisFor(orders, period.start, period.end);
  const previous = kpisFor(orders, period.prevStart, period.prevEnd);
  const change = {
    salesPence: pctChange(current.salesPence, previous.salesPence),
    orders: pctChange(current.orders, previous.orders),
    averagePence: pctChange(current.averagePence, previous.averagePence),
    taxPence: pctChange(current.taxPence, previous.taxPence),
    discountPence: pctChange(current.discountPence, previous.discountPence),
  };
  const report: Report = {
    period: {
      range: period.range,
      fromDate: period.fromDate,
      toDate: period.toDate,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      versus: period.versus,
      dayStart: hhmm(dayStartMinutes),
    },
    kpis: { current, previous, change },
    hourly: hourlySeries(orders, period.start, period.end, timeZone, dayStartMinutes),
    daily: dailySeries(orders, period, timeZone, dayStartMinutes),
    topItems: topItemsFor(input.items, 10, withProfit),
    payments: paymentsByMethod(input.payments),
    sources: sourceShares(orders, period.start, period.end),
    types: typeSharesFor(orders, period.start, period.end),
    unpaid: unpaidOrders(orders, period.start, period.end),
  };
  if (withProfit) {
    const asProfitOrders = (list: readonly ReportOrder[]) =>
      list.map((o) => ({
        status: o.status,
        subtotal: o.subtotal,
        discount_amount: o.discount_amount,
        tax_amount: o.tax_amount,
        total: o.total,
        refunded_amount: o.refunded_amount ?? 0,
        cost_total: o.cost_total ?? null,
        cost_complete: o.cost_complete ?? false,
      }));
    const now = summarizeProfit(asProfitOrders(countedOrders(orders, period.start, period.end)), input.expenses?.current ?? []);
    const before = summarizeProfit(asProfitOrders(countedOrders(orders, period.prevStart, period.prevEnd)), input.expenses?.previous ?? []);
    // A % change from a loss (or from nothing) reads backwards, so it is left out then.
    const change = before.netProfit > 0 ? pctChange(toPence(now.netProfit), toPence(before.netProfit)) : null;
    report.profit = { ...now, previousNetProfit: before.netProfit, change };
  }
  return report;
}
