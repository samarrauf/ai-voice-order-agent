import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { SESSION_COOKIE } from "@/lib/session";
import { RID, RUN_MARKER, callTool, cleanupTestOrders, db, orderBody, useOpenClock, useRealClock, sessionToken } from "./helpers/helpers";

// PARITY: the phone agent (create-order) and the POS (manual-order) must produce
// EXACTLY the same bill for the same food: subtotal, discount, delivery fee,
// service charge, tax, total, and the saved order columns. Both go through
// computeBill (lib/order-pricing.ts); these tests prove it end to end.
//
// The agent only takes delivery or collection ("pickup"); collection is billed
// like a POS takeaway. Dine-in exists only on the POS (a seated table).
//
// Runs on a THROWAWAY restaurant (name "vitest-run-...-parity", removed by the
// self-heal in tests/helpers/global-setup.ts if a run is interrupted). The demo
// restaurant is only READ (its opening hours are copied); its settings are never changed.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */

async function callStaff(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, any> }> {
  const res = await manualOrder(
    new Request("http://localhost/api/staff/manual-order", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${sessionToken(rid)}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

let rid: string;
let pizzaId: string; // sizes 10 inch 7.95 (default) / 12 inch 9.45, option Extra Cheese +1.15
let chipsId: string; // 2.35, no sizes

// Odd prices on purpose, so percentages don't come out round and rounding is exercised.
// (9.45 + 1.15) x 2 + 2.35 x 3 = 21.20 + 7.05 = 28.25
const items = () => [
  { menu_item_id: pizzaId, size_name: "12 inch", quantity: 2, options: ["Extra cheese"], notes: null },
  { menu_item_id: chipsId, size_name: null, quantity: 3, options: [], notes: null },
];

const BASE = {
  delivery_fee: 2.5,
  tax_rate_percent: 0,
  service_charge_percent: 0,
  service_charge_applies_to: "none",
  max_discount_percent: 0,
  min_order_value: null,
};

const COMBOS: { name: string; settings: Record<string, unknown> }[] = [
  { name: "tax 0, no extras", settings: { ...BASE } },
  { name: "tax 10%", settings: { ...BASE, tax_rate_percent: 10 } },
  { name: "service charge 12.5% dine-in only", settings: { ...BASE, service_charge_percent: 12.5, service_charge_applies_to: "dine_in" } },
  { name: "service charge 12.5% on all orders", settings: { ...BASE, service_charge_percent: 12.5, service_charge_applies_to: "all" } },
  { name: "delivery fee 3.75", settings: { ...BASE, delivery_fee: 3.75 } },
  {
    name: "everything together (tax 10%, service 12.5% all, delivery 3.75)",
    settings: { ...BASE, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", delivery_fee: 3.75 },
  },
];

const configure = async (patch: Record<string, unknown>) => {
  const { error } = await db.from("restaurants").update(patch).eq("id", rid);
  if (error) throw error;
};

const BILL_KEYS = ["subtotal", "discount", "delivery_fee", "service_charge", "tax", "total"] as const;
const pickBill = (j: Record<string, any>) => Object.fromEntries(BILL_KEYS.map((k) => [k, j[k]]));

const SAVED_COLS =
  "fulfilment_type, subtotal, delivery_fee, discount_type, discount_value, discount_amount, discount_reason, service_charge_amount, tax_amount, total, payment_status, paid_amount";
async function savedBill(where: { id?: string; order_number?: string }) {
  let q = db.from("orders").select(SAVED_COLS).eq("restaurant_id", rid);
  q = where.id ? q.eq("id", where.id) : q.eq("order_number", where.order_number!);
  const { data, error } = await q.single();
  if (error) throw error;
  // numeric columns come back as strings or numbers; compare as numbers.
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]),
  );
}

/** Places the same cart through the agent (preview + real) and the POS. */
async function both(type: "delivery" | "pickup") {
  const agentBody = orderBody({ restaurant_id: rid, fulfilment_type: type, items: items() });
  if (type === "pickup") Object.assign(agentBody, { delivery_address: null, delivery_postcode: null });
  const preview = await callTool(createOrder, { ...agentBody, preview: true });
  const agent = await callTool(createOrder, agentBody);
  const pos = await callStaff({
    restaurant_id: rid,
    order_type: type === "delivery" ? "delivery" : "takeaway",
    customer_name: "Vitest Customer",
    customer_phone: "07700900123",
    delivery_address: type === "delivery" ? "12 Test Street, Manchester" : null,
    delivery_postcode: type === "delivery" ? "M14 5TP" : null,
    notes: RUN_MARKER,
    items: items(),
  });
  expect(preview.status, JSON.stringify(preview.json)).toBe(200);
  expect(agent.status, JSON.stringify(agent.json)).toBe(200);
  expect(pos.status, JSON.stringify(pos.json)).toBe(201);
  return { preview, agent, pos };
}

beforeAll(async () => {
  const napoli = await db.from("restaurants").select("opening_hours, timezone").eq("id", RID).single();
  if (napoli.error) throw napoli.error;
  const r = await db
    .from("restaurants")
    .insert({ name: `${RUN_MARKER}-parity`, opening_hours: napoli.data.opening_hours, timezone: napoli.data.timezone, ...BASE })
    .select("id")
    .single();
  if (r.error) throw r.error;
  rid = r.data.id;

  const m = await db
    .from("menu_items")
    .insert([
      { restaurant_id: rid, name: "Vitest Pizza", base_price: 7.95 },
      { restaurant_id: rid, name: "Vitest Chips", base_price: 2.35 },
    ])
    .select("id, name");
  if (m.error) throw m.error;
  pizzaId = m.data.find((x) => x.name === "Vitest Pizza")!.id;
  chipsId = m.data.find((x) => x.name === "Vitest Chips")!.id;

  const s = await db.from("item_sizes").insert([
    { menu_item_id: pizzaId, name: "10 inch", price: 7.95, is_default: true },
    { menu_item_id: pizzaId, name: "12 inch", price: 9.45, is_default: false },
  ]);
  if (s.error) throw s.error;
  const o = await db
    .from("item_options")
    .insert({ restaurant_id: rid, menu_item_id: pizzaId, group_name: "Toppings", name: "Extra Cheese", price_delta: 1.15, max_select: 3 });
  if (o.error) throw o.error;
});

// The agent refuses orders when the restaurant is closed: pin the clock to an open time.
beforeEach(useOpenClock);
afterEach(useRealClock);

afterAll(async () => {
  await cleanupTestOrders();
  if (rid) await db.from("restaurants").delete().eq("id", rid); // menu, sizes, options go with it
});

describe("agent create-order and POS manual-order give the SAME bill", () => {
  for (const combo of COMBOS) {
    for (const type of ["delivery", "pickup"] as const) {
      it(`${combo.name} · ${type === "pickup" ? "collection / takeaway" : "delivery"}`, async () => {
        await configure(combo.settings);
        const { preview, agent, pos } = await both(type);

        // 1. The bill in the responses: every field identical.
        expect(pickBill(agent.json)).toEqual(pickBill(pos.json));
        // The preview the caller hears is the bill that gets saved.
        expect(pickBill(preview.json)).toEqual(pickBill(agent.json));
        // The agent never gives a discount.
        expect(agent.json.discount).toBe(0);

        // 2. The saved order rows: every bill column identical.
        const savedAgent = await savedBill({ order_number: agent.json.order_number });
        const savedPos = await savedBill({ id: pos.json.order_id });
        expect(savedAgent).toEqual(savedPos);
        expect(savedAgent).toMatchObject({ discount_type: "none", discount_value: 0, discount_amount: 0, discount_reason: null, payment_status: "unpaid", paid_amount: 0 });
        expect(savedAgent.total).toBe(agent.json.total);

        // 3. Speech: the total is the server's, and zero charges are never mentioned.
        const speech: string = preview.json.speech;
        expect(speech).toContain(`${Number(agent.json.total).toFixed(2)} in total`);
        expect(speech).not.toContain("£");
        if (agent.json.tax > 0) expect(speech).toContain(`${agent.json.tax.toFixed(2)} tax`);
        else expect(speech).not.toMatch(/\btax\b/i);
        if (agent.json.service_charge > 0) expect(speech).toContain(`${agent.json.service_charge.toFixed(2)} service charge`);
        else expect(speech).not.toMatch(/service charge/i);
      });
    }
  }

  // Worked out by hand, so a mistake shared by both routes would still be caught.
  it("everything together, delivery: the numbers are right, not just equal", async () => {
    await configure(COMBOS[COMBOS.length - 1].settings);
    const { agent, pos } = await both("delivery");
    // food 28.25; delivery 3.75; service 12.5% of 28.25 = 3.53125 -> 3.53;
    // tax 10% of (28.25 + 3.75 + 3.53 = 35.53) = 3.553 -> 3.55; total 39.08
    const expected = { subtotal: 28.25, discount: 0, delivery_fee: 3.75, service_charge: 3.53, tax: 3.55, total: 39.08 };
    expect(pickBill(agent.json)).toEqual(expected);
    expect(pickBill(pos.json)).toEqual(expected);
  });

  it("service charge 'dine_in' only: a phone collection pays none, like a POS takeaway", async () => {
    await configure(COMBOS[2].settings);
    const { agent, pos } = await both("pickup");
    expect(agent.json.service_charge).toBe(0);
    expect(pos.json.service_charge).toBe(0);
    expect(agent.json.total).toBe(28.25);
  });
});
