import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as menuRoute } from "@/app/api/staff/menu/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as expensesRoute } from "@/app/api/staff/expenses/route";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as searchMenu } from "@/app/api/tools/search-menu/route";
import { POST as lookupOrder } from "@/app/api/tools/lookup-order/route";
import { GET as ordersApi } from "@/app/api/orders/route";
import { loadBoardOrders } from "@/lib/orders-board";
import { loadHome } from "@/lib/dashboard-home";
import { loadPrintData } from "@/lib/receipt-data";
import { buildKot, buildReceipt } from "@/lib/receipt";
import { rangeForDates } from "@/lib/expenses";
import { orderProfit } from "@/lib/profit";
import { loadCostMaps, loadProfitSummary } from "@/lib/profit-data";
import type { StaffRole } from "@/lib/permissions";
import { RID, RUN_MARKER, callTool, db, staffCookie, useOpenClock as pinOpenClock, useRealClock as restoreClock } from "./helpers/helpers";

// B2: item cost, the cost snapshot on every order, owner-only profit, expenses.
// Needs migration 0025. Only throwaway restaurants ("vitest-run-..."); Napoli and Olive
// are only READ (Napoli's opening hours are copied so the agent takes orders).
// MOST IMPORTANT: no response a manager or staff member (or the agent, the website,
// the bill, the kitchen ticket) gets may contain a cost or profit field.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */

let A: string;
let B: string;
const cookies: Record<string, string> = {};
let pizzaId: string; // sizes 10 inch 7.95 (cost 3.00, default) / 12 inch 9.45 (cost 4.00); Extra Cheese +1.15 (cost 0.40)
let chipsId: string; // 2.35, cost 0.80, no sizes
let mysteryId: string; // 5.00, cost NOT set
let catA: string;

// ---------------------------------------------------------------------------
// helpers

async function post(handler: (r: Request) => Promise<Response>, path: string, body: unknown, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await handler(new Request(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const menu = (body: unknown, cookie: string | null = cookies.ownerA) => post(menuRoute, "/api/staff/menu", body, cookie);
const preview = (body: unknown, cookie: string | null = cookies.ownerA) => post(pricePreview, "/api/staff/price-preview", body, cookie);
const pos = (body: unknown, cookie: string | null = cookies.ownerA) => post(manualOrder, "/api/staff/manual-order", body, cookie);
const expenses = (body: unknown, cookie: string | null = cookies.ownerA) => post(expensesRoute, "/api/staff/expenses", body, cookie);

const COST_NAME = /cost|profit/i;
/** Every key anywhere in a JSON value whose NAME mentions cost or profit. */
function costKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => costKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [...(COST_NAME.test(k) ? [`${path}.${k}`] : []), ...costKeys(v, `${path}.${k}`)]);
  }
  return [];
}
const expectNoCost = (label: string, value: unknown) => expect(costKeys(value), `${label} leaks cost/profit`).toEqual([]);

const cart = () => [
  { menu_item_id: pizzaId, size_name: "12 inch", quantity: 2, options: ["Extra cheese"], notes: null },
  { menu_item_id: chipsId, size_name: null, quantity: 3, options: [], notes: null },
];
const takeaway = (items: unknown[], extra: Record<string, unknown> = {}) => ({ order_type: "takeaway", notes: RUN_MARKER, items, ...extra });

async function savedItems(orderId: string) {
  const r = await db.from("order_items").select("item_name, size_name, quantity, unit_price, unit_cost, line_cost").eq("order_id", orderId).order("item_name");
  if (r.error) throw r.error;
  return r.data.map((i) => ({ ...i, unit_price: Number(i.unit_price), unit_cost: i.unit_cost === null ? null : Number(i.unit_cost), line_cost: i.line_cost === null ? null : Number(i.line_cost) }));
}
async function savedOrder(where: { id?: string; order_number?: string }, rid = A) {
  let q = db.from("orders").select("id, status, subtotal, discount_amount, tax_amount, delivery_fee, total, cost_total, cost_complete").eq("restaurant_id", rid);
  q = where.id ? q.eq("id", where.id) : q.eq("order_number", where.order_number!);
  const r = await q.single();
  if (r.error) throw r.error;
  return r.data;
}

/** The agent takes orders only while the restaurant is open: pin the clock for that call only. */
async function agent(body: Record<string, unknown>) {
  pinOpenClock();
  try {
    return await callTool(createOrder, body);
  } finally {
    restoreClock();
  }
}
const agentBody = (rid: string, items: unknown[], extra: Record<string, unknown> = {}) => ({
  restaurant_id: rid,
  call_id: null,
  fulfilment_type: "pickup",
  customer_name: "Vitest Customer",
  customer_phone: "07700900123",
  delivery_address: null,
  delivery_postcode: null,
  payment_method: "cash",
  notes: RUN_MARKER,
  items,
  ...extra,
});

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const napoli = await db.from("restaurants").select("opening_hours, timezone").eq("id", RID).single();
  if (napoli.error) throw napoli.error;
  for (const label of ["a", "b"]) {
    const r = await db
      .from("restaurants")
      .insert({
        name: `${RUN_MARKER}-cost-${label}`,
        opening_hours: napoli.data.opening_hours,
        timezone: napoli.data.timezone,
        delivery_fee: 2.5,
        tax_rate_percent: 10,
        service_charge_percent: 0,
        service_charge_applies_to: "none",
        max_discount_percent: 50,
        min_order_value: null,
      })
      .select("id")
      .single();
    if (r.error) throw r.error;
    if (label === "a") A = r.data.id;
    else B = r.data.id;
  }
  for (const role of ["owner", "manager", "staff"] as const) cookies[`${role}A`] = await staffCookie(A, role);
  cookies.ownerB = await staffCookie(B, "owner");

  // The menu is made through the real menu editor API, costs included (owner).
  const c = await menu({ action: "category_add", name: "Mains" });
  expect(c.status).toBe(200);
  catA = c.json.id;
  const pizza = await menu({
    action: "item_save",
    item: {
      category_id: catA,
      name: "Vitest Pizza",
      base_price: 7.95,
      cost_price: null,
      sizes: [
        { name: "10 inch", price: 7.95, is_default: true, cost_price: 3 },
        { name: "12 inch", price: 9.45, is_default: false, cost_price: 4 },
      ],
      options: [{ group_name: "Toppings", name: "Extra Cheese", price_delta: 1.15, max_select: 3, cost_price: 0.4 }],
    },
  });
  expect(pizza.status, JSON.stringify(pizza.json)).toBe(200);
  pizzaId = pizza.json.id;
  const chips = await menu({ action: "item_save", item: { category_id: catA, name: "Vitest Chips", base_price: 2.35, cost_price: 0.8 } });
  expect(chips.status).toBe(200);
  chipsId = chips.json.id;
  const mystery = await menu({ action: "item_save", item: { category_id: catA, name: "Vitest Mystery", base_price: 5 } });
  expect(mystery.status).toBe(200);
  mysteryId = mystery.json.id;
});

afterAll(async () => {
  for (const rid of [A, B]) {
    if (!rid) continue;
    await db.from("orders").delete().eq("restaurant_id", rid); // orders do not cascade from restaurants
    await db.from("restaurants").delete().eq("id", rid); // menu, costs, expenses, categories go with it
  }
});

// ---------------------------------------------------------------------------

describe("writing costs (menu editor)", () => {
  it("the owner's costs are stored in menu_costs, not on the public menu tables", async () => {
    const rows = await db.from("menu_costs").select("menu_item_id, item_size_id, item_option_id, cost_price").eq("restaurant_id", A);
    expect(rows.error).toBeNull();
    expect(rows.data!.map((r) => Number(r.cost_price)).sort()).toEqual([0.4, 0.8, 3, 4]);
    const item = await db.from("menu_items").select("*").eq("id", chipsId).single();
    expectNoCost("menu_items row", item.data);
    // Costs are never written to the menu change log.
    const log = await db.from("menu_changes").select("field, old_value, new_value").eq("restaurant_id", A);
    expect(log.data!.some((l) => COST_NAME.test(l.field))).toBe(false);
  });

  it("a manager or staff member may not send a cost (403), and nothing changes", async () => {
    for (const who of ["managerA", "staffA"]) {
      const r = await menu({ action: "item_save", id: chipsId, item: { category_id: catA, name: "Vitest Chips", base_price: 2.35, cost_price: 0.01 } }, cookies[who]);
      expect(r.status).toBe(403);
      expectNoCost(`${who} menu response`, r.json);
    }
    const r = await menu(
      { action: "item_save", id: pizzaId, item: { category_id: catA, name: "Vitest Pizza", base_price: 7.95, sizes: [{ name: "10 inch", price: 7.95, is_default: true, cost_price: 0 }] } },
      cookies.managerA,
    );
    expect(r.status).toBe(403);
    expect((await loadCostMaps(A)).item.get(chipsId)).toBe(0.8);
  });

  it("a manager's save (no cost fields) keeps the size and extra costs, even though the rows are re-created", async () => {
    const r = await menu(
      {
        action: "item_save",
        id: pizzaId,
        item: {
          category_id: catA,
          name: "Vitest Pizza",
          base_price: 7.95,
          description: "edited by the manager",
          sizes: [
            { name: "10 inch", price: 7.95, is_default: true },
            { name: "12 inch", price: 9.45, is_default: false },
          ],
          options: [{ group_name: "Toppings", name: "Extra Cheese", price_delta: 1.15, max_select: 3 }],
        },
      },
      cookies.managerA,
    );
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expectNoCost("manager menu save response", r.json);
    const costs = await loadCostMaps(A);
    expect(costs.size.get(`${pizzaId}|10 inch`)).toBe(3);
    expect(costs.size.get(`${pizzaId}|12 inch`)).toBe(4);
    expect([...costs.option.values()]).toEqual([0.4]);
  });

  it("a cost with three decimals or below zero is refused", async () => {
    for (const bad of [-1, 0.123]) {
      const r = await menu({ action: "item_save", id: chipsId, item: { category_id: catA, name: "Vitest Chips", base_price: 2.35, cost_price: bad } });
      expect(r.status).toBe(400);
    }
  });
});

describe("the cost snapshot when an order is sold", () => {
  let first: string;

  it("POS: size cost + extras cost, times quantity; cost_total and cost_complete", async () => {
    const r = await pos(takeaway(cart()));
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    first = r.json.order_id;
    expect(await savedItems(first)).toEqual([
      { item_name: "Vitest Chips", size_name: null, quantity: 3, unit_price: 2.35, unit_cost: 0.8, line_cost: 2.4 },
      { item_name: "Vitest Pizza", size_name: "12 inch", quantity: 2, unit_price: 10.6, unit_cost: 4.4, line_cost: 8.8 },
    ]);
    const o = await savedOrder({ id: first });
    expect(Number(o.cost_total)).toBe(11.2);
    expect(o.cost_complete).toBe(true);
    // subtotal 28.25, no discount -> profit 17.05 (tax is not profit).
    expect(orderProfit(o)).toBe(17.05);
  });

  it("the default size uses its own cost (10 inch = 3.00), without extras", async () => {
    const r = await pos(takeaway([{ menu_item_id: pizzaId, size_name: null, quantity: 1, options: [], notes: null }]));
    expect(r.status).toBe(201);
    expect((await savedItems(r.json.order_id))[0]).toMatchObject({ size_name: "10 inch", unit_cost: 3, line_cost: 3 });
  });

  it("changing the menu cost later does NOT change an order already sold", async () => {
    const before = await savedOrder({ id: first });
    const r = await menu({ action: "item_save", id: chipsId, item: { category_id: catA, name: "Vitest Chips", base_price: 2.35, cost_price: 1.5 } });
    expect(r.status).toBe(200);
    expect(await savedOrder({ id: first })).toEqual(before);
    expect((await savedItems(first))[0].unit_cost).toBe(0.8);
    // A new order uses the new cost.
    const next = await pos(takeaway([{ menu_item_id: chipsId, size_name: null, quantity: 1, options: [], notes: null }]));
    expect((await savedItems(next.json.order_id))[0].unit_cost).toBe(1.5);
    // Put it back for the other tests.
    expect((await menu({ action: "item_save", id: chipsId, item: { category_id: catA, name: "Vitest Chips", base_price: 2.35, cost_price: 0.8 } })).status).toBe(200);
  });

  it("an item without a cost: unit_cost null, cost_complete false, cost_total = the known lines only", async () => {
    const r = await pos(takeaway([{ menu_item_id: mysteryId, size_name: null, quantity: 2, options: [], notes: null }, cart()[1]]));
    expect(r.status).toBe(201);
    const items = await savedItems(r.json.order_id);
    expect(items.find((i) => i.item_name === "Vitest Mystery")).toMatchObject({ unit_cost: null, line_cost: null });
    const o = await savedOrder({ id: r.json.order_id });
    expect(o.cost_complete).toBe(false);
    expect(Number(o.cost_total)).toBe(2.4);
  });

  it("an extra without a cost makes the line's cost unknown", async () => {
    const opt = await db.from("item_options").select("id").eq("menu_item_id", pizzaId).single();
    await db.from("menu_costs").delete().eq("item_option_id", opt.data!.id);
    try {
      const r = await pos(takeaway([cart()[0]]));
      expect((await savedItems(r.json.order_id))[0]).toMatchObject({ unit_cost: null, line_cost: null });
      expect((await savedOrder({ id: r.json.order_id })).cost_complete).toBe(false);
    } finally {
      await db.from("menu_costs").insert({ restaurant_id: A, item_option_id: opt.data!.id, cost_price: 0.4 });
    }
  });

  it("a discount lowers the profit; tax and the delivery fee are not profit", async () => {
    const r = await pos({
      order_type: "delivery",
      customer_name: "Vitest Customer",
      customer_phone: "07700900123",
      delivery_address: "12 Test Street, Manchester",
      delivery_postcode: "M14 5TP",
      notes: RUN_MARKER,
      discount: { type: "percent", value: 10, reason: "test" },
      items: cart(),
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const o = await savedOrder({ id: r.json.order_id });
    expect(Number(o.discount_amount)).toBe(2.83); // 10% of 28.25, rounded
    expect(Number(o.tax_amount)).toBeGreaterThan(0);
    expect(Number(o.delivery_fee)).toBe(2.5);
    // profit = 28.25 - 2.83 - 11.20 = 14.22, whatever the tax and delivery fee are.
    expect(orderProfit(o)).toBe(14.22);
  });

  it("a cost sent in the items is ignored: the database works it out itself", async () => {
    const rpc = await db.rpc("create_order_tx", {
      p_order: { restaurant_id: A, fulfilment_type: "pickup", customer_name: "Vitest", customer_phone: "07700900123", subtotal: 2.35, delivery_fee: 0, total: 2.35, notes: RUN_MARKER, source: "walk_in", cost_total: 0, cost_complete: true },
      p_items: [{ menu_item_id: chipsId, item_name: "Vitest Chips", size_name: null, options: [], quantity: 1, unit_price: 2.35, line_total: 2.35, unit_cost: 999, line_cost: 999 }],
    });
    expect(rpc.error).toBeNull();
    const id = (rpc.data as any).id;
    expect((await savedItems(id))[0]).toMatchObject({ unit_cost: 0.8, line_cost: 0.8 });
    expect(Number((await savedOrder({ id })).cost_total)).toBe(0.8);
  });

  it("the agent and the POS save the SAME cost snapshot for the same food", async () => {
    const a = await agent(agentBody(A, cart()));
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    expectNoCost("agent create-order", a.json);
    const p = await pos(takeaway(cart()));
    const agentOrder = await savedOrder({ order_number: a.json.order_number });
    const posOrder = await savedOrder({ id: p.json.order_id });
    expect(await savedItems(agentOrder.id)).toEqual(await savedItems(posOrder.id));
    expect([agentOrder.cost_total, agentOrder.cost_complete]).toEqual([posOrder.cost_total, posOrder.cost_complete]);
  });

  it("the owner's POS preview shows the same cost the saved order gets", async () => {
    const r = await preview({ order_type: "takeaway", items: [...cart(), { menu_item_id: mysteryId, size_name: null, quantity: 1, options: [], notes: null }] });
    expect(r.status).toBe(200);
    expect(r.json.lines.map((l: any) => l.cost)).toEqual([
      { unit_cost: 4.4, line_cost: 8.8, profit: 12.4 }, // (10.60 - 4.40) x 2
      { unit_cost: 0.8, line_cost: 2.4, profit: 4.65 }, // (2.35 - 0.80) x 3
      { unit_cost: null, line_cost: null, profit: null }, // cost not set
    ]);
  });
});

describe("NO cost or profit for anyone but the owner (every response searched)", () => {
  let orderId: string;
  let orderNumber: string;

  beforeAll(async () => {
    const r = await pos(takeaway(cart(), { customer_name: "Vitest Customer", customer_phone: "07700900123" }), cookies.staffA);
    expect(r.status).toBe(201);
    orderId = r.json.order_id;
    orderNumber = r.json.order_number;
  });

  for (const role of ["manager", "staff"] as const) {
    it(`${role}: POS price preview and manual order`, async () => {
      const p = await preview({ order_type: "takeaway", items: cart() }, cookies[`${role}A`]);
      expect(p.status).toBe(200);
      expectNoCost(`${role} price-preview`, p.json);
      const o = await pos(takeaway(cart()), cookies[`${role}A`]);
      expect(o.status).toBe(201);
      expectNoCost(`${role} manual-order`, o.json);
    });

    it(`${role}: orders board, Home and the menu editor API`, async () => {
      const board = await loadBoardOrders(A, role as StaffRole);
      expect(board.length).toBeGreaterThan(0);
      expectNoCost(`${role} orders board`, board);
      const home = await loadHome({ restaurantId: A, role: role as StaffRole, range: "month" });
      expectNoCost(`${role} home`, home);
      expect("profit" in home).toBe(false);
    });
  }

  it("manager: menu editor saves answer without cost", async () => {
    const r = await menu({ action: "item_availability", id: chipsId, available: true }, cookies.managerA);
    expect(r.status).toBe(200);
    expectNoCost("menu availability", r.json);
  });

  it("print bill and kitchen ticket (any role, owner too) never carry cost", async () => {
    const data = await loadPrintData(orderId, A);
    expect(data).not.toBeNull();
    expectNoCost("print data", data);
    expectNoCost("bill", buildReceipt(data!));
    expectNoCost("kitchen ticket", buildKot(data!));
  });

  it("voice agent: search-menu, preview, create-order and lookup-order", async () => {
    const s = await callTool(searchMenu, { restaurant_id: A, query: "pizza" });
    expect(s.status).toBe(200);
    expectNoCost("search-menu", s.json);
    const pv = await agent({ ...agentBody(A, cart()), preview: true });
    expect(pv.status).toBe(200);
    expectNoCost("agent preview", pv.json);
    const lk = await callTool(lookupOrder, { restaurant_id: A, order_number: orderNumber, customer_phone: "07700900123" });
    expectNoCost("lookup-order", lk.json);
  });

  it("orders API (/api/orders) never carries cost", async () => {
    const req = new NextRequest(`http://localhost/api/orders?restaurant_id=${A}&limit=50`, { headers: { "x-tool-secret": process.env.TOOL_API_SECRET! } });
    const res = await ordersApi(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain("Vitest Pizza");
    expectNoCost("/api/orders", json);
  });

  it("the public key (website) cannot read costs or call the cost function", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const costs = await anon.from("menu_costs").select("*").eq("restaurant_id", A);
    expect(costs.data ?? []).toEqual([]);
    const items = await anon.from("menu_items").select("*, item_sizes(*)").eq("restaurant_id", A);
    expect(items.data!.length).toBeGreaterThan(0);
    expectNoCost("public menu_items", items.data);
    const options = await anon.from("item_options").select("*").eq("restaurant_id", A);
    expectNoCost("public item_options", options.data);
    for (const table of ["orders", "order_items", "expenses", "expense_categories"]) {
      const r = await anon.from(table).select("*").limit(5);
      expect(r.data ?? [], table).toEqual([]);
    }
    const fn = await anon.rpc("order_line_unit_cost", { p_restaurant_id: A, p_menu_item_id: chipsId, p_size_name: null, p_options: [] });
    expect(fn.error?.code).toBe("42501");
  });

  it("the owner DOES get them (so the checks above are not empty by accident)", async () => {
    const p = await preview({ order_type: "takeaway", items: cart() });
    expect(costKeys(p.json).length).toBeGreaterThan(0);
    const board = await loadBoardOrders(A, "owner");
    expect(board.find((o) => o.id === orderId)?.profit).toEqual({ profit: 17.05, complete: true });
    const home = await loadHome({ restaurantId: A, role: "owner", range: "month" });
    expect(home.profit).toBeDefined();
  });
});

describe("expenses", () => {
  let rent: string;
  let other: string;

  beforeAll(async () => {
    for (const rid of [A, B]) expect((await db.rpc("ensure_default_expense_categories", { p_restaurant_id: rid })).error).toBeNull();
    const cats = await db.from("expense_categories").select("id, name").eq("restaurant_id", A);
    rent = cats.data!.find((c) => c.name === "Rent")!.id;
    other = (await db.from("expense_categories").select("id").eq("restaurant_id", B).eq("name", "Rent").single()).data!.id;
  });

  it("the ten default categories are made once", async () => {
    expect((await db.rpc("ensure_default_expense_categories", { p_restaurant_id: A })).error).toBeNull();
    const cats = await db.from("expense_categories").select("name").eq("restaurant_id", A);
    expect(cats.data!.map((c) => c.name).sort()).toEqual(
      ["Electricity", "Fuel/Delivery", "Gas", "Ingredients", "Maintenance", "Marketing", "Other", "Packaging", "Rent", "Salaries"],
    );
  });

  it("only the owner may add, void or add a category (manager and staff 403, no login 401)", async () => {
    const body = { action: "add", expense_date: "2026-11-20", category_id: rent, amount: 10, paid_from: "bank" };
    expect((await expenses(body, null)).status).toBe(401);
    expect((await expenses(body, cookies.managerA)).status).toBe(403);
    expect((await expenses(body, cookies.staffA)).status).toBe(403);
    expect((await expenses({ action: "category_add", name: "Nope" }, cookies.managerA)).status).toBe(403);
  });

  it("add, then void with a reason: never deleted, counted only while not void", async () => {
    const a = await expenses({ action: "add", expense_date: "2026-11-20", category_id: rent, description: "November rent", amount: 100, paid_from: "bank" });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    const b = await expenses({ action: "add", expense_date: "2026-11-20", category_id: rent, amount: 30.5, paid_from: "drawer_cash" });
    expect(b.status).toBe(201);

    expect((await expenses({ action: "void", id: b.json.id, reason: "" })).status).toBe(400);
    const v = await expenses({ action: "void", id: b.json.id, reason: "typed twice" });
    expect(v.status).toBe(200);
    expect((await expenses({ action: "void", id: b.json.id, reason: "again" })).status).toBe(409);
    const row = await db.from("expenses").select("voided_at, void_reason, voided_by").eq("id", b.json.id).single();
    expect(row.data!.voided_at).not.toBeNull();
    expect(row.data!.void_reason).toBe("typed twice");
    expect(row.data!.voided_by).not.toBeNull();

    const s = await loadProfitSummary(A, rangeForDates("2026-11-01", "2026-11-30", "Europe/London"));
    expect(s.expenses).toBe(100);
  });

  it("bad amounts and dates are refused", async () => {
    for (const bad of [0, -5, 1.234]) {
      expect((await expenses({ action: "add", expense_date: "2026-11-20", category_id: rent, amount: bad, paid_from: "bank" })).status).toBe(400);
    }
    expect((await expenses({ action: "add", expense_date: "2026-02-30", category_id: rent, amount: 5, paid_from: "bank" })).status).toBe(400);
    expect((await expenses({ action: "add", expense_date: "2026-11-20", category_id: rent, amount: 5, paid_from: "card" })).status).toBe(400);
  });

  it("owner can add a category; the same name twice = 409", async () => {
    expect((await expenses({ action: "category_add", name: "Vitest Supplies" })).status).toBe(201);
    expect((await expenses({ action: "category_add", name: "vitest supplies" })).status).toBe(409);
  });

  it("tenant isolation: another restaurant's category, expense or body restaurant_id are refused", async () => {
    // A's owner cannot file an expense under B's category.
    expect((await expenses({ action: "add", expense_date: "2026-11-20", category_id: other, amount: 5, paid_from: "bank" })).status).toBe(404);
    // The database refuses it too, even with the service key.
    const direct = await db.from("expenses").insert({ restaurant_id: A, expense_date: "2026-11-20", category_id: other, amount: 5, paid_from: "bank" });
    expect(direct.error).not.toBeNull();
    // B's owner cannot void A's expense.
    const a = await expenses({ action: "add", expense_date: "2026-11-21", category_id: rent, amount: 7, paid_from: "other" });
    expect((await expenses({ action: "void", id: a.json.id, reason: "not mine" }, cookies.ownerB)).status).toBe(404);
    // A different restaurant_id in the body = 403.
    expect((await expenses({ restaurant_id: B, action: "category_add", name: "Sneaky" })).status).toBe(403);
    // B's summary sees none of A's money.
    const sB = await loadProfitSummary(B, rangeForDates("2026-01-01", "2099-12-31", "Europe/London"));
    expect([sB.orders, sB.expenses, sB.itemCost]).toEqual([0, 0, 0]);
  });

  it("tenant isolation: costs of one restaurant never price another's order", async () => {
    const fn = await db.rpc("order_line_unit_cost", { p_restaurant_id: B, p_menu_item_id: chipsId, p_size_name: null, p_options: [] });
    expect(fn.error).toBeNull();
    expect(fn.data).toBeNull();
    expect((await loadCostMaps(B)).item.size).toBe(0);
    const p = await preview({ order_type: "takeaway", items: cart() }, cookies.ownerB);
    expect(p.status).toBe(400); // A's items are not on B's menu
  });
});

describe("the profit summary", () => {
  it("adds up sales, item cost, gross profit, expenses and net profit; cancelled orders are left out", async () => {
    const range = rangeForDates("2020-01-01", "2099-12-31", "Europe/London");
    const before = await loadProfitSummary(A, range);

    const r = await pos(takeaway(cart()));
    const o = await savedOrder({ id: r.json.order_id });
    const after = await loadProfitSummary(A, range);
    expect(after.orders).toBe(before.orders + 1);
    expect(after.itemCost).toBeCloseTo(before.itemCost + 11.2, 2);
    expect(after.grossProfit).toBeCloseTo(before.grossProfit + 17.05, 2);
    expect(after.sales).toBeCloseTo(before.sales + Number(o.total) - Number(o.tax_amount), 2);
    expect(after.netProfit).toBeCloseTo(after.grossProfit - after.expenses, 2);
    expect(after.incompleteOrders).toBeGreaterThan(0); // the Mystery orders above

    await db.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    expect(await loadProfitSummary(A, range)).toEqual(before);
  });
});
