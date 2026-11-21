import { describe, expect, it } from "vitest";
import {
  buildSalesReport,
  orderSalesPence,
  orderTypeOf,
  pctChange,
  periodFor,
  salesSeries,
  sharePercents,
  timeAgo,
  topItems,
  totalsFor,
  typeShares,
  zonedMidnight,
  type StatsOrder,
} from "@/lib/dashboard-stats";

const order = (o: Partial<StatsOrder> & { created_at: string }): StatsOrder => ({
  status: "completed",
  fulfilment_type: "pickup",
  source: "phone",
  table_session_id: null,
  total: 10,
  tax_amount: 0,
  paid_amount: 0,
  ...o,
});

const LONDON = "Europe/London";
const KARACHI = "Asia/Karachi";

describe("sales rule: total minus tax, cancelled out", () => {
  it("tax is not part of sales", () => {
    expect(orderSalesPence({ status: "completed", total: 12, tax_amount: 2 })).toBe(1000);
  });
  it("a cancelled order has no sales", () => {
    expect(orderSalesPence({ status: "cancelled", total: 12, tax_amount: 2 })).toBe(0);
  });
  it("never negative and adds in whole pence", () => {
    expect(orderSalesPence({ status: "new", total: 1, tax_amount: 5 })).toBe(0);
    const now = new Date("2026-11-21T12:00:00Z");
    const p = periodFor("today", now, LONDON);
    const orders = [0.1, 0.2].map((total) => order({ total, created_at: "2026-11-21T08:00:00Z" }));
    expect(totalsFor(orders, p.start, p.end).salesPence).toBe(30);
  });
  it("totals leave cancelled orders out of every figure (count, sales, billed, paid)", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const p = periodFor("today", now, LONDON);
    const t = totalsFor(
      [
        order({ total: 20, tax_amount: 2, paid_amount: 20, created_at: "2026-11-21T09:00:00Z" }),
        order({ status: "cancelled", total: 99, paid_amount: 99, created_at: "2026-11-21T09:30:00Z" }),
      ],
      p.start,
      p.end,
    );
    expect(t).toEqual({ orders: 1, salesPence: 1800, averagePence: 1800, paidPence: 2000, billedPence: 2000 });
  });
  it("an overpaid order never lifts collected above billed", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const p = periodFor("today", now, LONDON);
    const r = buildSalesReport({ orders: [order({ total: 10, paid_amount: 50, created_at: "2026-11-21T09:00:00Z" })], items: [], range: "today", now, timeZone: LONDON });
    expect(r.collected).toEqual({ percent: 100, paidPence: 1000, billedPence: 1000 });
    expect(p.start.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });
});

describe("time zones", () => {
  it("local midnight, also across the clocks changing (London 29 Mar 2026)", () => {
    expect(zonedMidnight(2026, 3, 29, LONDON).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(zonedMidnight(2026, 3, 30, LONDON).toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(zonedMidnight(2026, 11, 21, KARACHI).toISOString()).toBe("2026-11-20T19:00:00.000Z");
  });
  it("today starts at the restaurant's midnight", () => {
    const now = new Date("2026-11-21T05:00:00Z"); // 10:00 in Karachi, 05:00 in London
    expect(periodFor("today", now, KARACHI).start.toISOString()).toBe("2026-11-20T19:00:00.000Z");
    expect(periodFor("today", now, LONDON).start.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });
  it("hour buckets follow the time zone: 19:30Z is 00:30 tomorrow in Karachi", () => {
    const now = new Date("2026-11-21T05:00:00Z");
    const orders = [order({ total: 10, created_at: "2026-11-20T19:30:00Z" })];
    const karachi = salesSeries(orders, "today", periodFor("today", now, KARACHI), KARACHI);
    expect(karachi.find((p) => p.label === "00")?.salesPence).toBe(1000);
    // In London the same order is still yesterday (19:30), so it is not part of today at all.
    const london = salesSeries(orders, "today", periodFor("today", now, LONDON), LONDON);
    expect(london.reduce((a, p) => a + p.salesPence, 0)).toBe(0);
  });
  it("today's hours cover 10-22 and widen for orders outside that", () => {
    const now = new Date("2026-11-21T20:00:00Z");
    const p = periodFor("today", now, LONDON);
    expect(salesSeries([], "today", p, LONDON).map((x) => x.label)).toEqual(["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"]);
    const late = salesSeries([order({ created_at: "2026-11-21T01:15:00Z" })], "today", p, LONDON);
    expect(late[0].label).toBe("01");
  });
  it("7 days gives 7 day buckets, the month one per day so far", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    expect(salesSeries([], "7d", periodFor("7d", now, LONDON), LONDON, now)).toHaveLength(7);
    const month = salesSeries([order({ created_at: "2026-11-03T12:00:00Z", total: 5 })], "month", periodFor("month", now, LONDON), LONDON, now);
    expect(month).toHaveLength(21);
    expect(month[2].salesPence).toBe(500);
  });
  it("last month's equal stretch is capped at this month's start (Mar 31 vs short February)", () => {
    const now = new Date("2026-03-31T12:00:00Z");
    const p = periodFor("month", now, LONDON);
    expect(p.prevStart.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(p.prevEnd.getTime()).toBeLessThanOrEqual(p.start.getTime());
  });
  it("an unknown time zone does not crash", () => {
    expect(() => periodFor("today", new Date("2026-11-21T12:00:00Z"), "Not/AZone")).not.toThrow();
  });
});

describe("percentages", () => {
  it("shares add up to exactly 100", () => {
    for (const v of [[1, 1, 1], [1, 2, 3], [5, 0, 0], [33, 33, 34], [7, 11, 13, 17], [1, 1]]) {
      expect(sharePercents(v).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(sharePercents([1, 1, 1])).toEqual([34, 33, 33]);
  });
  it("an empty or all-zero set is all zeros, bad numbers are ignored", () => {
    expect(sharePercents([])).toEqual([]);
    expect(sharePercents([0, 0, 0])).toEqual([0, 0, 0]);
    expect(sharePercents([NaN, -3, 4])).toEqual([0, 0, 100]);
  });
  it("order types: dine-in, takeaway, delivery add up to 100", () => {
    const from = new Date("2026-11-21T00:00:00Z");
    const to = new Date("2026-11-22T00:00:00Z");
    const at = "2026-11-21T10:00:00Z";
    const shares = typeShares(
      [
        order({ created_at: at, table_session_id: "t1" }),
        order({ created_at: at, source: "table_booking" }),
        order({ created_at: at, fulfilment_type: "delivery" }),
        order({ created_at: at }),
        order({ created_at: at }),
        order({ created_at: at, status: "cancelled", fulfilment_type: "delivery" }),
      ],
      from,
      to,
    );
    expect(Object.fromEntries(shares.map((s) => [s.type, s.count]))).toEqual({ dine_in: 2, takeaway: 2, delivery: 1 });
    expect(shares.reduce((a, s) => a + s.percent, 0)).toBe(100);
    expect(orderTypeOf({ fulfilment_type: "pickup", source: "walk_in", table_session_id: null })).toBe("takeaway");
  });
  it("percent change does not crash when the previous period is zero", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(Number.NaN, 4)).toBeNull();
  });
});

describe("report and lists", () => {
  it("an empty restaurant gives zeros everywhere, never NaN", () => {
    const r = buildSalesReport({ orders: [], items: [], range: "today", now: new Date("2026-11-21T12:00:00Z"), timeZone: LONDON });
    expect(r.current).toEqual({ orders: 0, salesPence: 0, averagePence: 0, paidPence: 0, billedPence: 0 });
    expect(r.change).toEqual({ sales: 0, orders: 0, average: 0 });
    expect(r.collected.percent).toBe(0);
    expect(r.types.map((t) => t.percent)).toEqual([0, 0, 0]);
  });
  it("compares with the previous period (today vs yesterday up to now)", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const r = buildSalesReport({
      orders: [
        order({ total: 30, created_at: "2026-11-21T09:00:00Z" }),
        order({ total: 20, created_at: "2026-11-20T09:00:00Z" }),
        order({ total: 500, created_at: "2026-11-20T18:00:00Z" }), // yesterday evening: after "yesterday up to 12:00"
      ],
      items: [],
      range: "today",
      now,
      timeZone: LONDON,
    });
    expect(r.current.orders).toBe(1);
    expect(r.previous.orders).toBe(1);
    expect(r.change.sales).toBe(50);
  });
  it("top items: merges names regardless of case, best first, five at most", () => {
    const items = [
      { item_name: "Margherita", quantity: 2 },
      { item_name: "margherita ", quantity: 3 },
      { item_name: "Cola", quantity: 4 },
      ...["A", "B", "C", "D", "E"].map((n) => ({ item_name: n, quantity: 1 })),
    ];
    const top = topItems(items);
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ name: "Margherita", quantity: 5 });
    expect(top[1]).toEqual({ name: "Cola", quantity: 4 });
  });
  it("time ago", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    expect(timeAgo("2026-11-21T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-21T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-11-21T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-11-19T12:00:00Z", now)).toBe("2 d ago");
  });
});
