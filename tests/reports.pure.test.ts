import { describe, expect, it } from "vitest";
import { COST_FIELD_PATTERN } from "@/lib/profit";
import {
  buildReport,
  businessDateOf,
  businessDayMinutes,
  dailySeries,
  hourlySeries,
  kpisFor,
  orderTaxPence,
  paymentsByMethod,
  reportPeriod,
  sourceShares,
  topItemsFor,
  typeSharesFor,
  unpaidOrders,
  zonedTime,
  type ReportOrder,
} from "@/lib/reports";
import { parseSettings } from "@/lib/settings";

const LONDON = "Europe/London";
const KARACHI = "Asia/Karachi";
let seq = 0;
const order = (o: Partial<ReportOrder> & { created_at: string }): ReportOrder => ({
  id: `o${++seq}`,
  order_number: `A-${seq}`,
  status: "completed",
  payment_status: "paid",
  fulfilment_type: "pickup",
  source: "phone",
  table_session_id: null,
  subtotal: 10,
  discount_amount: 0,
  tax_amount: 0,
  total: 10,
  paid_amount: 10,
  refunded_amount: 0,
  ...o,
});

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe("business day", () => {
  it("parses HH:MM and Postgres HH:MM:SS; anything else is midnight", () => {
    expect(businessDayMinutes("04:00")).toBe(240);
    expect(businessDayMinutes("04:30:00")).toBe(270);
    expect(businessDayMinutes("00:00:00")).toBe(0);
    expect(businessDayMinutes("25:00")).toBe(0);
    expect(businessDayMinutes(null)).toBe(0);
  });

  it("an order before business_day_start belongs to the day before", () => {
    // 02:30 London (winter = UTC) on Tue 24 Nov 2026
    expect(businessDateOf(new Date("2026-11-24T02:30:00Z"), LONDON, 240)).toBe("2026-11-23");
    expect(businessDateOf(new Date("2026-11-24T04:00:00Z"), LONDON, 240)).toBe("2026-11-24");
    expect(businessDateOf(new Date("2026-11-24T02:30:00Z"), LONDON, 0)).toBe("2026-11-24");
  });

  it("uses the restaurant time zone (Karachi is UTC+5)", () => {
    // 22:00 UTC = 03:00 next day in Karachi: before a 04:00 start it is still the 24th
    expect(businessDateOf(new Date("2026-11-24T22:00:00Z"), KARACHI, 240)).toBe("2026-11-24");
    expect(businessDateOf(new Date("2026-11-24T23:30:00Z"), KARACHI, 240)).toBe("2026-11-25");
    expect(zonedTime("2026-11-25", 240, KARACHI).toISOString()).toBe("2026-11-24T23:00:00.000Z");
  });

  it("is right across daylight saving (London summer = UTC+1)", () => {
    expect(zonedTime("2026-07-01", 240, LONDON).toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(zonedTime("2026-03-29", 240, LONDON).toISOString()).toBe("2026-03-29T03:00:00.000Z"); // the change day itself
  });
});

describe("reportPeriod", () => {
  const now = new Date("2026-11-26T02:00:00Z"); // 02:00 Thu in London

  it("today with a 04:00 start: at 02:00 it is still yesterday's business day", () => {
    const p = reportPeriod({ range: "today" }, now, LONDON, 240);
    expect(p.fromDate).toBe("2026-11-25");
    expect(p.start.toISOString()).toBe("2026-11-25T04:00:00.000Z");
    expect(p.end).toEqual(now);
    expect(p.prevStart.toISOString()).toBe("2026-11-24T04:00:00.000Z");
    expect(p.prevEnd.toISOString()).toBe("2026-11-25T02:00:00.000Z"); // same length (22h)
  });

  it("today with midnight start", () => {
    const p = reportPeriod({ range: "today" }, now, LONDON, 0);
    expect(p.fromDate).toBe("2026-11-26");
    expect(p.start.toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });

  it("yesterday is one whole business day, compared with the day before", () => {
    const p = reportPeriod({ range: "yesterday" }, new Date("2026-11-26T12:00:00Z"), LONDON, 240);
    expect([p.fromDate, p.toDate]).toEqual(["2026-11-25", "2026-11-25"]);
    expect(p.start.toISOString()).toBe("2026-11-25T04:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-26T04:00:00.000Z");
    expect(p.prevStart.toISOString()).toBe("2026-11-24T04:00:00.000Z");
    expect(p.prevEnd).toEqual(p.start);
  });

  it("7d and 30d include today; the previous stretch is just as long", () => {
    const at = new Date("2026-11-26T12:00:00Z");
    const w = reportPeriod({ range: "7d" }, at, LONDON, 0);
    expect([w.fromDate, w.toDate, w.prevFromDate, w.prevToDate]).toEqual(["2026-11-20", "2026-11-26", "2026-11-13", "2026-11-19"]);
    const m = reportPeriod({ range: "30d" }, at, LONDON, 0);
    expect([m.fromDate, m.prevFromDate, m.prevToDate]).toEqual(["2026-10-28", "2026-09-28", "2026-10-27"]);
  });

  it("this month runs from the 1st; last month's stretch never passes into this month", () => {
    const p = reportPeriod({ range: "month" }, new Date("2026-03-31T12:00:00Z"), LONDON, 0);
    expect(p.fromDate).toBe("2026-03-01");
    expect(p.prevFromDate).toBe("2026-02-01");
    expect(p.prevEnd).toEqual(p.start);
  });

  it("custom: swapped if reversed, never past today, bad dates fall back to today", () => {
    const at = new Date("2026-11-26T12:00:00Z");
    const p = reportPeriod({ range: "custom", from: "2026-11-30", to: "2026-11-20" }, at, LONDON, 0);
    expect([p.fromDate, p.toDate]).toEqual(["2026-11-20", "2026-11-26"]);
    expect([p.prevFromDate, p.prevToDate]).toEqual(["2026-11-13", "2026-11-19"]);
    expect(p.end).toEqual(at);
    const bad = reportPeriod({ range: "custom", from: "nope", to: null }, at, LONDON, 0);
    expect([bad.fromDate, bad.toDate]).toEqual(["2026-11-26", "2026-11-26"]);
    const long = reportPeriod({ range: "custom", from: "2020-01-01", to: "2026-11-01" }, at, LONDON, 0);
    expect(long.fromDate).toBe("2025-11-01"); // capped at 366 days
  });
});

describe("KPIs: the sales rules", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-12-01T00:00:00Z");

  it("cancelled and merged orders are left out of everything", () => {
    const k = kpisFor(
      [
        order({ created_at: "2026-11-10T12:00:00Z", total: 10 }),
        order({ created_at: "2026-11-10T12:00:00Z", status: "cancelled", total: 50, tax_amount: 5, discount_amount: 5 }),
        order({ created_at: "2026-11-10T12:00:00Z", status: "merged", total: 70 }),
      ],
      from,
      to,
    );
    expect(k).toEqual({ salesPence: 1000, orders: 1, averagePence: 1000, taxPence: 0, discountPence: 0 });
  });

  it("tax is never revenue; tax and discounts are reported on their own", () => {
    const k = kpisFor([order({ created_at: "2026-11-10T12:00:00Z", subtotal: 20, discount_amount: 2, tax_amount: 3.6, total: 21.6 })], from, to);
    expect(k.salesPence).toBe(1800);
    expect(k.taxPence).toBe(360);
    expect(k.discountPence).toBe(200);
  });

  it("a refund comes off sales (without its tax share) and off tax collected", () => {
    const o = order({ created_at: "2026-11-10T12:00:00Z", subtotal: 100, tax_amount: 20, total: 120, paid_amount: 60, refunded_amount: 60 });
    const k = kpisFor([o], from, to);
    expect(k.salesPence).toBe(5000); // 100 - 50 (half refunded, ex tax)
    expect(k.taxPence).toBe(1000); // 20 - 10
    expect(orderTaxPence({ ...o, refunded_amount: 120 })).toBe(0);
  });

  it("orders outside [from, to) do not count", () => {
    expect(kpisFor([order({ created_at: "2026-10-31T23:59:59Z" }), order({ created_at: "2026-12-01T00:00:00Z" })], from, to).orders).toBe(0);
  });
});

describe("charts follow the business day", () => {
  it("daily: an order at 02:30 goes to the day before when the day starts at 04:00", () => {
    const p = reportPeriod({ range: "custom", from: "2026-11-23", to: "2026-11-24" }, new Date("2026-11-26T12:00:00Z"), LONDON, 240);
    const rows = dailySeries([order({ created_at: "2026-11-24T02:30:00Z", total: 7 }), order({ created_at: "2026-11-24T12:00:00Z", total: 3 })], p, LONDON, 240);
    expect(rows.map((r) => [r.key, r.salesPence, r.orders])).toEqual([
      ["2026-11-23", 700, 1],
      ["2026-11-24", 300, 1],
    ]);
  });

  it("hourly: runs in business-day order (04 ... 23, 00 ... 03) and keeps late hours", () => {
    const rows = hourlySeries([order({ created_at: "2026-11-24T02:30:00Z", total: 5 })], new Date("2026-11-23T04:00:00Z"), new Date("2026-11-25T04:00:00Z"), LONDON, 240);
    expect(rows[0].key).toBe("10");
    expect(rows.at(-1)!.key).toBe("02");
    expect(rows.find((r) => r.key === "02")!.salesPence).toBe(500);
    expect(rows.map((r) => r.key)).toContain("23");
  });
});

describe("breakdowns", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-12-01T00:00:00Z");
  const at = "2026-11-10T12:00:00Z";

  it("payment methods: refunds come off, every method listed", () => {
    const rows = paymentsByMethod([
      { kind: "payment", method: "cash", amount: 20 },
      { kind: "payment", method: "card", amount: "15.50" },
      { kind: "refund", method: "card", amount: 5 },
    ]);
    expect(rows.map((r) => [r.method, r.netPence])).toEqual([
      ["cash", 2000],
      ["card", 1050],
      ["online", 0],
      ["other", 0],
    ]);
  });

  it("sources and types count only sold orders; WhatsApp appears once it has orders", () => {
    const orders = [
      order({ created_at: at, source: "phone", fulfilment_type: "delivery", total: 10 }),
      order({ created_at: at, source: "walk_in", table_session_id: "t1", total: 30 }),
      order({ created_at: at, source: "phone", status: "cancelled", total: 99 }),
    ];
    const s = sourceShares(orders, from, to);
    expect(s.map((r) => r.key)).toEqual(["phone", "staff_phone", "walk_in", "table_booking"]);
    expect(s.find((r) => r.key === "phone")).toMatchObject({ orders: 1, salesPence: 1000, percent: 25 });
    expect(sourceShares([...orders, order({ created_at: at, source: "whatsapp" })], from, to).map((r) => r.key)).toContain("whatsapp");
    expect(typeSharesFor(orders, from, to).map((r) => [r.key, r.orders])).toEqual([
      ["dine_in", 1],
      ["takeaway", 0],
      ["delivery", 1],
    ]);
  });

  it("unpaid list: unpaid and part-paid only, owed amount, oldest first", () => {
    const u = unpaidOrders(
      [
        order({ created_at: "2026-11-11T12:00:00Z", payment_status: "partial", total: 20, paid_amount: 5 }),
        order({ created_at: "2026-11-10T12:00:00Z", payment_status: "unpaid", total: 8, paid_amount: 0 }),
        order({ created_at: at, payment_status: "paid", total: 8, paid_amount: 8 }),
        order({ created_at: at, status: "cancelled", payment_status: "unpaid", total: 8, paid_amount: 0 }),
      ],
      from,
      to,
    );
    expect(u.count).toBe(2);
    expect(u.owedPence).toBe(2300);
    expect(u.orders.map((o) => o.owedPence)).toEqual([800, 1500]);
  });
});

describe("top items", () => {
  it("top 10 by quantity, then amount; bad lines skipped", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ order_id: "o", item_name: `Item ${i}`, quantity: i + 1, line_total: i + 1 }));
    items.push({ order_id: "o", item_name: "Item 11", quantity: 0, line_total: 999 }, { order_id: "o", item_name: " ", quantity: 3, line_total: 3 });
    const top = topItemsFor(items, 10, false);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ name: "Item 11", quantity: 12, amountPence: 1200 });
    const tie = topItemsFor(
      [
        { order_id: "o", item_name: "Chips", quantity: 2, line_total: 4 },
        { order_id: "o", item_name: "Burger", quantity: 2, line_total: 12 },
      ],
      10,
      false,
    );
    expect(tie.map((t) => t.name)).toEqual(["Burger", "Chips"]);
    // The most-sold spelling is shown, whatever order the rows come in.
    const a = { order_id: "o", item_name: "chips", quantity: 1, line_total: 2 };
    const b = { order_id: "o", item_name: "Chips", quantity: 3, line_total: 6 };
    expect(topItemsFor([a, b], 10, false)[0].name).toBe("Chips");
    expect(topItemsFor([b, a], 10, false)[0].name).toBe("Chips");
  });
});

describe("profit is owner-only", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const period = reportPeriod({ range: "7d" }, now, LONDON, 0);
  const orders = [
    order({ created_at: "2026-11-25T12:00:00Z", subtotal: 20, total: 20, cost_total: 8, cost_complete: true }),
    order({ created_at: "2026-11-25T13:00:00Z", subtotal: 10, total: 10, cost_total: 2, cost_complete: false }),
    order({ created_at: "2026-11-15T12:00:00Z", subtotal: 10, total: 10, cost_total: 5, cost_complete: true }), // previous week
  ];
  const items = [
    { order_id: "x", item_name: "Margherita", quantity: 2, line_total: 20, line_cost: 8 },
    { order_id: "y", item_name: "margherita", quantity: 1, line_total: 10, line_cost: null },
  ];
  const input = { period, orders, items, payments: [], timeZone: LONDON, dayStartMinutes: 0 };

  it("without view_profit: no cost or profit key anywhere, even if rows carried cost columns", () => {
    const r = buildReport({ ...input, withProfit: false, expenses: { current: [100], previous: [] } });
    expect(r.profit).toBeUndefined();
    const leaked = keysOf(JSON.parse(JSON.stringify(r))).filter((k) => COST_FIELD_PATTERN.test(k));
    expect(leaked).toEqual([]);
    expect(r.topItems[0]).toEqual({ name: "Margherita", quantity: 3, amountPence: 3000 });
  });

  it("owner: gross, item cost, expenses, net, per-item profit and the missing-cost count", () => {
    const r = buildReport({ ...input, withProfit: true, expenses: { current: [5], previous: [1] } });
    expect(r.profit).toMatchObject({ sales: 30, itemCost: 10, grossProfit: 20, expenses: 5, netProfit: 15, orders: 2, incompleteOrders: 1, previousNetProfit: 4 });
    expect(r.profit!.change).toBe(275);
    expect(r.topItems[0]).toMatchObject({ profitPence: 1200, costMissingLines: 1 });
  });
});

describe("settings: business_day_start", () => {
  it("accepts HH:MM, stores HH:MM:00, refuses anything else", () => {
    const ok = parseSettings({ section: "reports", values: { business_day_start: "04:00" } });
    expect(ok).toEqual({ ok: true, data: { section: "reports", values: { business_day_start: "04:00:00" } } });
    for (const bad of ["4am", "24:00", "", 4]) {
      expect(parseSettings({ section: "reports", values: { business_day_start: bad } }).ok).toBe(false);
    }
    expect(parseSettings({ section: "reports", values: { business_day_start: "04:00", timezone: "UTC" } }).ok).toBe(false);
  });
});
