import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as reportsRoute } from "@/app/api/staff/reports/route";
import { POST as settingsRoute } from "@/app/api/staff/settings/route";
import { loadReport } from "@/lib/reports-data";
import { RUN_MARKER, db, staffCookie } from "./helpers/helpers";

// P4 Reports, against the live database. Needs migration 0032 (business_day_start).
// Only throwaway restaurants ("vitest-run-..."); Napoli and Olive are never touched.
// Rows are written straight into the tables (service key) with fixed dates, so the
// expected totals are exact. MOST IMPORTANT: profit and cost fields reach the owner only.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */

let A: string;
let B: string;
const cookies: Record<string, string> = {};
const DAY = "2026-11-10"; // London winter time = UTC, so the ISO times below are local clock times

async function get(query: string, cookie: string | null) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const res = await reportsRoute(new Request(`http://localhost/api/staff/reports?${query}`, { headers }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const forDay = (cookie: string | null) => get(`range=custom&from=${DAY}&to=${DAY}`, cookie);

const COST_NAME = /cost|profit/i;
function costKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => costKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [...(COST_NAME.test(k) ? [`${path}.${k}`] : []), ...costKeys(v, `${path}.${k}`)]);
  }
  return [];
}

async function insertOrder(rid: string, o: Record<string, unknown>): Promise<string> {
  const r = await db
    .from("orders")
    .insert({ restaurant_id: rid, fulfilment_type: "pickup", source: "phone", status: "completed", notes: RUN_MARKER, ...o })
    .select("id")
    .single();
  if (r.error) throw r.error;
  return r.data.id;
}

beforeAll(async () => {
  for (const label of ["a", "b"]) {
    const r = await db
      .from("restaurants")
      .insert({ name: `${RUN_MARKER}-reports-${label}`, timezone: "Europe/London", currency: "GBP" })
      .select("id")
      .single();
    if (r.error) throw r.error;
    if (label === "a") A = r.data.id;
    else B = r.data.id;
  }
  for (const role of ["owner", "manager", "staff"] as const) cookies[`${role}A`] = await staffCookie(A, role);
  cookies.ownerB = await staffCookie(B, "owner");

  // A's day starts at 04:00, set through the real Settings API (owner).
  const save = await settingsRoute(
    new Request("http://localhost/api/staff/settings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.ownerA },
      body: JSON.stringify({ section: "reports", values: { business_day_start: "04:00" } }),
    }),
  );
  expect(save.status).toBe(200);

  // 1. normal sale on the 10th: 20 - 2 discount + 3.60 tax = 21.60, paid by card; cost known
  const o1 = await insertOrder(A, {
    created_at: `${DAY}T12:00:00Z`,
    subtotal: 20, discount_type: "fixed", discount_value: 2, discount_amount: 2, tax_amount: 3.6, total: 21.6,
    paid_amount: 21.6, payment_status: "paid", cost_total: 6, cost_complete: true,
  });
  // 2. 02:30 on the 11th = still the 10th's business day; 12 with 2 tax, paid 12 cash then 6 refunded; one cost unknown
  const o2 = await insertOrder(A, {
    created_at: "2026-11-11T02:30:00Z", source: "walk_in",
    subtotal: 10, tax_amount: 2, total: 12, paid_amount: 6, refunded_amount: 6, payment_status: "partially_refunded",
    cost_total: 3, cost_complete: false,
  });
  // 3 + 4. cancelled and merged: never sales
  await insertOrder(A, { created_at: `${DAY}T13:00:00Z`, status: "cancelled", subtotal: 50, total: 50 });
  await insertOrder(A, { created_at: `${DAY}T13:30:00Z`, status: "merged", subtotal: 40, total: 40 });
  // 5. unpaid delivery taken on the staff phone
  await insertOrder(A, {
    created_at: `${DAY}T15:00:00Z`, status: "ready", source: "staff_phone", fulfilment_type: "delivery",
    subtotal: 8, total: 8, paid_amount: 0, payment_status: "unpaid",
  });
  // 6. 05:00 on the 11th = the 11th's business day: outside the report
  await insertOrder(A, { created_at: "2026-11-11T05:00:00Z", subtotal: 100, total: 100 });
  // Restaurant B, same day: must never show up in A's report
  await insertOrder(B, { created_at: `${DAY}T12:00:00Z`, subtotal: 999, total: 999 });

  const items = await db.from("order_items").insert([
    { order_id: o1, item_name: "Vitest Pizza", quantity: 2, unit_price: 10, line_total: 20, unit_cost: 3, line_cost: 6 },
    { order_id: o1, item_name: "Vitest Voided", quantity: 1, unit_price: 4, line_total: 4, voided_at: new Date().toISOString(), void_reason: "test" },
    { order_id: o2, item_name: "vitest pizza", quantity: 1, unit_price: 10, line_total: 10, unit_cost: null, line_cost: null },
  ]);
  if (items.error) throw items.error;

  const pays = await db.from("order_payments").insert([
    { restaurant_id: A, order_id: o1, method: "card", amount: 21.6, kind: "payment", created_at: `${DAY}T12:05:00Z` },
    { restaurant_id: A, order_id: o2, method: "cash", amount: 12, kind: "payment", created_at: "2026-11-11T02:35:00Z" },
    { restaurant_id: A, order_id: o2, method: "cash", amount: 6, kind: "refund", refund_reason: "test", created_at: "2026-11-11T03:00:00Z" },
  ]);
  if (pays.error) throw pays.error;

  expect((await db.rpc("ensure_default_expense_categories", { p_restaurant_id: A })).error).toBeNull();
  const cat = await db.from("expense_categories").select("id").eq("restaurant_id", A).limit(1).single();
  if (cat.error) throw cat.error;
  const exp = await db.from("expenses").insert([
    { restaurant_id: A, expense_date: DAY, category_id: cat.data.id, description: RUN_MARKER, amount: 5, paid_from: "other" },
    { restaurant_id: A, expense_date: DAY, category_id: cat.data.id, description: RUN_MARKER, amount: 50, paid_from: "other", voided_at: new Date().toISOString(), void_reason: "test" },
  ]);
  if (exp.error) throw exp.error;
});

afterAll(async () => {
  for (const rid of [A, B]) {
    if (!rid) continue;
    await db.from("orders").delete().eq("restaurant_id", rid); // items and payments go with them
    await db.from("settings_audit").delete().eq("restaurant_id", rid);
    await db.from("restaurants").delete().eq("id", rid);
  }
});

describe("business_day_start setting", () => {
  it("was saved as 04:00 with an audit row; a new restaurant starts at midnight", async () => {
    const a = await db.from("restaurants").select("business_day_start").eq("id", A).single();
    expect(a.data?.business_day_start).toBe("04:00:00");
    const audit = await db.from("settings_audit").select("section, changes").eq("restaurant_id", A).eq("section", "reports");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0].changes).toMatchObject({ business_day_start: { from: "00:00:00", to: "04:00:00" } });
    const b = await db.from("restaurants").select("business_day_start").eq("id", B).single();
    expect(b.data?.business_day_start).toBe("00:00:00");
  });

  it("only the owner may change it", async () => {
    for (const cookie of [cookies.managerA, cookies.staffA]) {
      const res = await settingsRoute(
        new Request("http://localhost/api/staff/settings", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ section: "reports", values: { business_day_start: "06:00" } }),
        }),
      );
      expect(res.status).toBe(403);
    }
  });
});

describe("who may open reports", () => {
  it("staff 403, logged out 401, a restaurant_id in the query 403", async () => {
    expect((await forDay(cookies.staffA)).status).toBe(403);
    expect((await forDay(null)).status).toBe(401);
    expect((await get(`range=today&restaurant_id=${B}`, cookies.ownerA)).status).toBe(403);
  });
});

describe("the numbers (owner, one business day)", () => {
  let r: any;
  beforeAll(async () => {
    const res = await forDay(cookies.ownerA);
    expect(res.status).toBe(200);
    r = res.json.report;
  });

  it("the day runs 04:00 to 04:00 and takes in the 02:30 order but not the 05:00 one", () => {
    expect(r.period).toMatchObject({ fromDate: DAY, toDate: DAY, dayStart: "04:00", start: "2026-11-10T04:00:00.000Z", end: "2026-11-11T04:00:00.000Z" });
    expect(r.daily).toEqual([expect.objectContaining({ key: DAY, salesPence: 3100, orders: 3 })]);
  });

  it("sales without tax, cancelled/merged out, refund taken off", () => {
    // 18.00 + (10.00 - 5.00 refund ex tax) + 8.00
    expect(r.kpis.current).toEqual({ salesPence: 3100, orders: 3, averagePence: 1033, taxPence: 460, discountPence: 200 });
  });

  it("payments by method (refund off cash), sources, types and the unpaid list", () => {
    const net = Object.fromEntries(r.payments.map((p: any) => [p.method, p.netPence]));
    expect(net).toEqual({ cash: 600, card: 2160, online: 0, other: 0 });
    const src = Object.fromEntries(r.sources.map((s: any) => [s.key, s.orders]));
    expect(src).toEqual({ phone: 1, staff_phone: 1, walk_in: 1, table_booking: 0 });
    const types = Object.fromEntries(r.types.map((t: any) => [t.key, t.orders]));
    expect(types).toEqual({ dine_in: 0, takeaway: 2, delivery: 1 });
    expect(r.unpaid.count).toBe(1);
    expect(r.unpaid.owedPence).toBe(800);
    expect(r.unpaid.orders[0]).toMatchObject({ paymentStatus: "unpaid", owedPence: 800, type: "delivery" });
  });

  it("top items: same name in any case counts once, voided lines left out", () => {
    expect(r.topItems).toEqual([{ name: "Vitest Pizza", quantity: 3, amountPence: 3000, profitPence: 1400, costMissingLines: 1 }]);
  });

  it("owner gets profit: gross, item cost, expenses (voided left out), net, missing-cost count", () => {
    expect(r.profit).toMatchObject({ sales: 31, itemCost: 9, grossProfit: 22, expenses: 5, netProfit: 17, orders: 3, incompleteOrders: 2 });
  });
});

describe("profit is owner-only", () => {
  it("the manager gets the same sales but no cost or profit field anywhere", async () => {
    const res = await forDay(cookies.managerA);
    expect(res.status).toBe(200);
    expect(res.json.report.kpis.current.salesPence).toBe(3100);
    expect(res.json.report.profit).toBeUndefined();
    expect(costKeys(res.json)).toEqual([]);
    expect(res.json.report.topItems).toEqual([{ name: "Vitest Pizza", quantity: 3, amountPence: 3000 }]);
  });

  it("the loader never returns profit for manager or staff roles either", async () => {
    for (const role of ["manager", "staff"] as const) {
      const data = await loadReport({ restaurantId: A, role, range: "custom", from: DAY, to: DAY });
      expect(costKeys(JSON.parse(JSON.stringify(data)))).toEqual([]);
    }
  });
});

describe("tenant isolation", () => {
  it("each owner sees only their own restaurant", async () => {
    const b = await forDay(cookies.ownerB);
    expect(b.status).toBe(200);
    expect(b.json.report.kpis.current).toMatchObject({ orders: 1, salesPence: 99900 });
    expect(b.json.report.period.dayStart).toBe("00:00");
    const a = await forDay(cookies.ownerA);
    expect(a.json.report.kpis.current.salesPence).toBe(3100);
  });
});
