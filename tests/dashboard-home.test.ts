import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import OrdersPage from "@/app/dashboard/orders/page";
import StatsPage from "@/app/dashboard/stats/page";
import { loadHome } from "@/lib/dashboard-home";
import { RUN_MARKER, db } from "./helpers/helpers";

// A3b: the Home dashboard's data. Only throwaway restaurants ("vitest-run-..."); Napoli and
// Olive are never touched. Checks tenant isolation, the owner/manager vs staff split and
// that the old orders-board page and the old /dashboard/stats link still work.

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const NOW = new Date();
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60000).toISOString();

let A: string;
let B: string;

beforeAll(async () => {
  const r = await db
    .from("restaurants")
    .insert([
      { name: `${RUN_MARKER}-home-A`, delivery_fee: 0, currency: "PKR", timezone: "Asia/Karachi" },
      { name: `${RUN_MARKER}-home-B`, delivery_fee: 0, currency: "GBP", timezone: "Europe/London" },
    ])
    .select("id, name");
  if (r.error) throw r.error;
  A = r.data.find((x) => x.name.endsWith("-A"))!.id;
  B = r.data.find((x) => x.name.endsWith("-B"))!.id;

  const mk = (rid: string, o: Record<string, unknown>) => ({ restaurant_id: rid, fulfilment_type: "pickup", subtotal: 0, notes: RUN_MARKER, ...o });
  const orders = await db
    .from("orders")
    .insert([
      // A: 100 total with 10 tax and fully paid (sales 90), a cancelled one (ignored), a new delivery and a preparing pickup.
      mk(A, { total: 100, tax_amount: 10, paid_amount: 100, status: "completed", created_at: at(1) }),
      mk(A, { total: 999, tax_amount: 0, paid_amount: 999, status: "cancelled", created_at: at(2) }),
      mk(A, { total: 50, tax_amount: 0, paid_amount: 0, status: "new", fulfilment_type: "delivery", created_at: at(3) }),
      mk(A, { total: 60, tax_amount: 0, paid_amount: 0, status: "preparing", created_at: at(4) }),
      // B: amounts that must never show up in A's numbers.
      mk(B, { total: 7777, tax_amount: 0, paid_amount: 7777, status: "completed", created_at: at(1) }),
    ])
    .select("id, restaurant_id, total");
  if (orders.error) throw orders.error;
  const a100 = orders.data.find((o) => o.restaurant_id === A && Number(o.total) === 100)!.id;
  const bOrder = orders.data.find((o) => o.restaurant_id === B)!.id;
  const items = await db.from("order_items").insert([
    { order_id: a100, item_name: "Vitest Pizza", quantity: 3, unit_price: 10, line_total: 30 },
    { order_id: bOrder, item_name: "Vitest B Secret Dish", quantity: 9, unit_price: 10, line_total: 90 },
  ]);
  if (items.error) throw items.error;

  const table = await db.from("restaurant_tables").insert({ restaurant_id: A, table_number: `${RUN_MARKER}-T1`, seats: 4 }).select("id").single();
  if (table.error) throw table.error;
  const session = await db.from("table_sessions").insert({ restaurant_id: A, table_id: table.data.id, party_size: 2, source: "walk_in" });
  if (session.error) throw session.error;
});

afterAll(async () => {
  const steps = [
    () => db.from("orders").delete().like("notes", `${RUN_MARKER}%`),
    () => db.from("table_sessions").delete().eq("restaurant_id", A),
    () => db.from("restaurant_tables").delete().like("table_number", `${RUN_MARKER}%`),
    () => db.from("restaurants").delete().in("id", [A, B]),
  ];
  for (const step of steps) {
    const res = await step();
    if (res.error) throw res.error;
  }
});

describe("Home data for owner and manager", () => {
  it("counts only this restaurant, leaves cancelled out and takes tax off sales", async () => {
    const home = await loadHome({ restaurantId: A, role: "owner", range: "7d", now: NOW });
    const r = home.reports!;
    expect(home.currency).toBe("PKR");
    expect(r.current.orders).toBe(3); // cancelled is not counted
    expect(r.current.salesPence).toBe(9000 + 5000 + 6000); // (100 - 10 tax) + 50 + 60
    expect(r.current.billedPence).toBe(21000);
    expect(r.collected).toEqual({ percent: 48, paidPence: 10000, billedPence: 21000 });
    expect(r.types.reduce((a, t) => a + t.percent, 0)).toBe(100);
    expect(r.topItems).toEqual([{ name: "Vitest Pizza", quantity: 3 }]);
    // Nothing of tenant B anywhere in A's payload.
    const json = JSON.stringify(home);
    expect(json).not.toContain("7777");
    expect(json).not.toContain("Secret Dish");
  });
  it("tenant B sees only its own figures", async () => {
    const home = await loadHome({ restaurantId: B, role: "manager", range: "7d", now: NOW });
    expect(home.reports!.current.orders).toBe(1);
    expect(home.reports!.current.salesPence).toBe(777700);
    expect(JSON.stringify(home)).not.toContain("Vitest Pizza");
  });
  it("running orders, waiting orders, tables and the latest five", async () => {
    const { ops } = await loadHome({ restaurantId: A, role: "owner", range: "today", now: NOW });
    expect(ops.running).toBe(2); // new + preparing
    expect(ops.waiting).toBe(1); // new
    expect(ops.tables).toEqual({ seated: 1, count: 1 });
    expect(ops.live).toHaveLength(4);
    expect(ops.live[0].total).toBe(100); // owners see amounts in the list
    expect(ops.live.find((o) => o.status === "new")?.type).toBe("delivery");
  });
  it("a restaurant with no tables has no tables card", async () => {
    const { ops } = await loadHome({ restaurantId: B, role: "owner", range: "today", now: NOW });
    expect(ops.tables).toBeNull();
  });
});

describe("Home data for staff has no sales figures at all", () => {
  it("no reports part, no money field anywhere in the payload", async () => {
    const home = await loadHome({ restaurantId: A, role: "staff", range: "7d", now: NOW });
    expect(home.reports).toBeNull();
    for (const o of home.ops.live) expect(Object.keys(o)).not.toContain("total");
    const json = JSON.stringify(home);
    for (const word of ["sales", "total", "average", "collected", "paid", "billed", "tax", "topItems", "series", "100", "999", "7777"]) {
      expect(json.toLowerCase()).not.toContain(`"${word}`);
    }
    expect(json).not.toContain("Vitest Pizza");
    // The operational part is still complete.
    expect(home.ops.running).toBe(2);
    expect(home.ops.live).toHaveLength(4);
  });
  it("an empty restaurant is fine for every role", async () => {
    const empty = await db.from("restaurants").insert({ name: `${RUN_MARKER}-home-empty`, delivery_fee: 0 }).select("id").single();
    if (empty.error) throw empty.error;
    try {
      for (const role of ["owner", "manager", "staff"] as const) {
        const home = await loadHome({ restaurantId: empty.data.id, role, range: "month", now: NOW });
        expect(home.ops).toEqual({ running: 0, waiting: 0, tables: null, live: [] });
        if (role !== "staff") expect(home.reports!.current.orders).toBe(0);
      }
    } finally {
      await db.from("restaurants").delete().eq("id", empty.data.id);
    }
  });
});

describe("old links keep working", () => {
  it("the orders board lives at /dashboard/orders (a page component)", () => {
    expect(typeof OrdersPage).toBe("function");
  });
  it("/dashboard/stats still redirects (now to Reports)", () => {
    try {
      StatsPage();
      throw new Error("no redirect");
    } catch (e) {
      const digest = (e as { digest?: string }).digest;
      expect(digest?.startsWith("NEXT_REDIRECT")).toBe(true);
      expect(digest?.split(";")[2]).toBe("/dashboard/reports");
    }
  });
});
