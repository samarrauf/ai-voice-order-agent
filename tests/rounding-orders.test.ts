import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as recordPayment } from "@/app/api/staff/record-payment/route";
import { POST as saveSettings } from "@/app/api/staff/settings/route";
import { buildReceipt, type PrintInput } from "@/lib/receipt";
import { SESSION_COOKIE } from "@/lib/session";
import { RUN_MARKER, callTool, cleanupTestOrders, db, orderBody, sessionToken, useOpenClock, useRealClock } from "./helpers/helpers";
import { randomUUID } from "node:crypto";

// P9a-A: rounding_step end to end, on THROWAWAY restaurants (names "vitest-run-...").
// Needs migration 0021. Napoli (the demo restaurant) is only READ (opening hours).
//   PKR restaurant: rounding_step 1, delivery 150, tax 10%, service 12.5% on all.
//   Food 2 x 799.50 + 3 x 235.25 = 2304.75.
//   Delivery: 2304.75 + 150 + service 288.09 + tax 274.28 = 3017.12 -> total 3017, rounding -0.12
//   Pickup:   2304.75 + service 288.09 + tax 259.28        = 2852.12 -> total 2852, rounding -0.12

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */

let rid: string; // PKR, rounding_step 1
let gbpId: string; // GBP, rounding_step 0.01 (default)
let itemA: string;
let itemB: string;
let gbpItem: string;

const items = () => [
  { menu_item_id: itemA, size_name: null, quantity: 2, options: [], notes: null },
  { menu_item_id: itemB, size_name: null, quantity: 3, options: [], notes: null },
];

async function staff(handler: (r: Request) => Promise<Response>, body: Record<string, unknown>, restaurant = rid) {
  const res = await handler(
    new Request("http://localhost/api/staff/test", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${await sessionToken(restaurant)}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const pos = (type: "delivery" | "takeaway", extra: Record<string, unknown> = {}) =>
  staff(manualOrder, {
    order_type: type,
    customer_name: "Vitest Customer",
    customer_phone: "07700900123",
    delivery_address: type === "delivery" ? "12 Test Street, Manchester" : null,
    delivery_postcode: type === "delivery" ? "M14 5TP" : null,
    notes: RUN_MARKER,
    items: items(),
    ...extra,
  });

const agent = (type: "delivery" | "pickup", preview = false) => {
  const body = orderBody({ restaurant_id: rid, fulfilment_type: type, items: items() });
  if (type === "pickup") Object.assign(body, { delivery_address: null, delivery_postcode: null });
  return callTool(createOrder, { ...body, preview });
};

const saved = async (where: { id?: string; order_number?: string }, restaurant = rid) => {
  let q = db.from("orders").select("*").eq("restaurant_id", restaurant);
  q = where.id ? q.eq("id", where.id) : q.eq("order_number", where.order_number!);
  const { data, error } = await q.single();
  if (error) throw error;
  return data as Record<string, any>;
};
const n = (v: unknown) => Number(v);
const BILL = ["subtotal", "discount", "delivery_fee", "service_charge", "tax", "rounding", "total"] as const;
const pick = (j: Record<string, any>) => Object.fromEntries(BILL.map((k) => [k, j[k]]));

beforeAll(async () => {
  const napoli = await db.from("restaurants").select("opening_hours, timezone").eq("id", "11111111-1111-1111-1111-111111111111").single();
  if (napoli.error) throw napoli.error;
  const common = { opening_hours: napoli.data.opening_hours, timezone: napoli.data.timezone };
  const made = await db
    .from("restaurants")
    .insert([
      {
        ...common, name: `${RUN_MARKER}-pkr`, currency: "PKR", rounding_step: 1, delivery_fee: 150, min_order_value: null,
        tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", max_discount_percent: 20,
      },
      {
        ...common, name: `${RUN_MARKER}-gbp`, currency: "GBP", rounding_step: 0.01, delivery_fee: 2.5, min_order_value: null,
        tax_rate_percent: 0, service_charge_percent: 0, service_charge_applies_to: "none", max_discount_percent: 0,
      },
    ])
    .select("id, name");
  if (made.error) throw made.error;
  rid = made.data.find((x) => x.name.endsWith("-pkr"))!.id;
  gbpId = made.data.find((x) => x.name.endsWith("-gbp"))!.id;

  const m = await db
    .from("menu_items")
    .insert([
      { restaurant_id: rid, name: "Vitest Karahi", base_price: 799.5 },
      { restaurant_id: rid, name: "Vitest Naan", base_price: 235.25 },
      { restaurant_id: gbpId, name: "Vitest GBP Pizza", base_price: 7.95 },
    ])
    .select("id, name");
  if (m.error) throw m.error;
  itemA = m.data.find((x) => x.name === "Vitest Karahi")!.id;
  itemB = m.data.find((x) => x.name === "Vitest Naan")!.id;
  gbpItem = m.data.find((x) => x.name === "Vitest GBP Pizza")!.id;
});

beforeEach(useOpenClock);
afterEach(useRealClock);

afterAll(async () => {
  await cleanupTestOrders();
  await db.from("restaurants").delete().in("id", [rid, gbpId].filter(Boolean));
});

describe("the database", () => {
  it("rounding_step only allows 0.01, 0.5 and 1", async () => {
    for (const bad of [0.25, 2, 0, -1]) {
      expect((await db.from("restaurants").update({ rounding_step: bad }).eq("id", gbpId)).error, `step ${bad}`).not.toBeNull();
    }
    for (const good of [0.5, 1, 0.01]) {
      expect((await db.from("restaurants").update({ rounding_step: good }).eq("id", gbpId)).error, `step ${good}`).toBeNull();
    }
  });

  it("a new restaurant starts at 0.01 and an order starts with rounding_amount 0", async () => {
    expect(n((await db.from("restaurants").select("rounding_step").eq("id", gbpId).single()).data!.rounding_step)).toBe(0.01);
    const o = await db.from("orders").insert({ restaurant_id: gbpId, fulfilment_type: "pickup", subtotal: 1, total: 1, notes: RUN_MARKER }).select("rounding_amount").single();
    expect(o.error).toBeNull();
    expect(n(o.data!.rounding_amount)).toBe(0);
  });

  it("create_order_tx refuses a total that does not add up (parts + rounding_amount)", async () => {
    const order = { restaurant_id: gbpId, fulfilment_type: "pickup", subtotal: 10, delivery_fee: 0, total: 10, notes: `${RUN_MARKER}-identity` };
    const line = [{ menu_item_id: gbpItem, item_name: "x", quantity: 1, unit_price: 10, line_total: 10, options: [] }];
    expect((await db.rpc("create_order_tx", { p_order: { ...order, total: 10.5 }, p_items: line })).error).not.toBeNull();
    expect((await db.rpc("create_order_tx", { p_order: { ...order, rounding_amount: 0.5, total: 10.5 }, p_items: line })).error).toBeNull();
    expect((await db.rpc("create_order_tx", { p_order: { ...order, rounding_amount: -0.4, total: 9.6 }, p_items: line })).error).toBeNull();
  });

  it("create_order_tx cannot be called with the browser (anon) key", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const r = await anon.rpc("create_order_tx", {
      p_order: { restaurant_id: gbpId, fulfilment_type: "pickup", subtotal: 1, delivery_fee: 0, total: 1, notes: `${RUN_MARKER}-anon` },
      p_items: [{ menu_item_id: gbpItem, item_name: "x", quantity: 1, unit_price: 1, line_total: 1, options: [] }],
    });
    expect(r.error?.message ?? "").toMatch(/permission denied/i);
    expect((await db.from("orders").select("id", { count: "exact", head: true }).like("notes", `${RUN_MARKER}-anon`)).count).toBe(0);
  });
});

describe("rounding step 1: agent and POS give the same whole-rupee bill", () => {
  for (const type of ["delivery", "pickup"] as const) {
    it(`${type === "pickup" ? "collection / takeaway" : "delivery"}: same numbers, the saved total is whole, the identity holds`, async () => {
      const preview = await agent(type, true);
      const phone = await agent(type);
      const till = await pos(type === "pickup" ? "takeaway" : "delivery");
      expect(preview.status, JSON.stringify(preview.json)).toBe(200);
      expect(phone.status, JSON.stringify(phone.json)).toBe(200);
      expect(till.status, JSON.stringify(till.json)).toBe(201);

      const expected =
        type === "delivery"
          ? { subtotal: 2304.75, discount: 0, delivery_fee: 150, service_charge: 288.09, tax: 274.28, rounding: -0.12, total: 3017 }
          : { subtotal: 2304.75, discount: 0, delivery_fee: 0, service_charge: 288.09, tax: 259.28, rounding: -0.12, total: 2852 };
      expect(pick(phone.json)).toEqual(expected);
      expect(pick(till.json)).toEqual(expected);
      expect(pick(preview.json)).toEqual(expected);

      // The saved rows: same columns, rounding_amount saved, total is the rounded one.
      const a = await saved({ order_number: phone.json.order_number });
      const p = await saved({ id: till.json.order_id });
      for (const row of [a, p]) {
        expect(n(row.rounding_amount)).toBe(-0.12);
        expect(n(row.total)).toBe(expected.total);
        expect(n(row.total) % 1).toBe(0);
        const sum = n(row.subtotal) - n(row.discount_amount) + n(row.delivery_fee) + n(row.service_charge_amount) + n(row.tax_amount) + n(row.rounding_amount);
        expect(Math.round(sum * 100)).toBe(Math.round(n(row.total) * 100));
      }
      for (const col of ["subtotal", "delivery_fee", "service_charge_amount", "tax_amount", "total", "rounding_amount", "payment_status", "paid_amount"]) {
        expect(n(a[col]) || a[col], col).toEqual(n(p[col]) || p[col]);
      }

      // Speech: the total the caller hears is the saved one, and rounding is mentioned because it is not 0.
      expect(preview.json.speech).toContain(`${expected.total.toFixed(2)} in total`);
      expect(preview.json.speech).toMatch(/rounding/i);
    });
  }

  it("price-preview (the POS screen) shows the same rounding as the saved order", async () => {
    const r = await staff(pricePreview, { order_type: "delivery", items: items() });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.rounding).toBe(-0.12);
    expect(r.json.total).toBe(3017);
  });

  it("a discount works as before and rounding comes AFTER it (10% off: 2074.28 + ... )", async () => {
    // food 2304.75 less 10% (230.48, rounded half up from 230.475) = 2074.27
    const r = await staff(pricePreview, { order_type: "takeaway", items: items(), discount: { type: "percent", value: 10, reason: "test" } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.discount).toBe(230.48);
    const sum = r.json.subtotal - r.json.discount + r.json.delivery_fee + r.json.service_charge + r.json.tax + r.json.rounding;
    expect(Math.round(sum * 100)).toBe(Math.round(r.json.total * 100));
    expect(r.json.total % 1).toBe(0);
    // The discount cap (20%) is not moved by rounding: 20.01% is refused, 20% is fine.
    expect((await staff(pricePreview, { order_type: "takeaway", items: items(), discount: { type: "percent", value: 20.01, reason: "x" } })).status).toBe(400);
    expect((await staff(pricePreview, { order_type: "takeaway", items: items(), discount: { type: "percent", value: 20, reason: "x" } })).status).toBe(200);
  });
});

describe("rounding step 0.01 (a GBP restaurant): rounding is always 0", () => {
  it("the bill has rounding 0, the saved rounding_amount is 0 and no 'rounding' is spoken", async () => {
    const r = await staff(manualOrder, { order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: gbpItem, quantity: 3 }] }, gbpId);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json.rounding).toBe(0);
    expect(r.json.total).toBe(23.85);
    expect(n((await saved({ id: r.json.order_id }, gbpId)).rounding_amount)).toBe(0);
  });
});

describe("the receipt shows a Rounding line only when it is not 0", () => {
  const input = (rounding: number | undefined, total: string, currency = "PKR"): PrintInput => ({
    restaurant: { name: "Vitest", currency, timezone: "Asia/Karachi" } as PrintInput["restaurant"],
    order: {
      order_number: "A-1", created_at: "2026-11-03T14:05:00Z", fulfilment_type: "pickup", subtotal: "3000.00", discount_amount: "0.00",
      delivery_fee: 0, service_charge_amount: "0.00", tax_amount: "0.00", total, payment_status: "unpaid", paid_amount: "0.00",
      ...(rounding === undefined ? {} : { rounding_amount: rounding }),
    } as PrintInput["order"],
    items: [{ item_name: "Karahi", quantity: 1, line_total: "3000.00" }] as PrintInput["items"],
    payments: [],
  });
  const labels = (i: PrintInput) => buildReceipt(i).rows.map((r) => r.label);

  it("negative and positive rounding show; zero and missing (an old order) do not", () => {
    expect(labels(input(-0.4, "2999.60"))).toContain("Rounding");
    expect(labels(input(0.5, "3000.50"))).toContain("Rounding");
    expect(labels(input(0, "3000.00"))).not.toContain("Rounding");
    expect(labels(input(undefined, "3000.00"))).not.toContain("Rounding");
  });

  it("the line sits just above TOTAL and uses the restaurant's currency format", () => {
    const rows = buildReceipt(input(-0.4, "2999.60")).rows;
    const i = rows.findIndex((r) => r.label === "Rounding");
    expect(rows[i + 1].label).toBe("TOTAL");
    expect(rows[i].value).toBe("-Rs 0.40");
    expect(rows[i + 1].value).toBe("Rs 2,999.60");
  });

  it("the balance is worked out from the saved (rounded) total", () => {
    const r = buildReceipt(input(-0.12, "3017.00"));
    expect(r.balanceDue).toBe("Rs 3,017");
  });
});

describe("payments work on the new, rounded total", () => {
  it("the exact rounded total pays the order in full; the unrounded figure is an overpayment", async () => {
    const o = await pos("delivery");
    expect(o.json.total).toBe(3017);
    const over = await staff(recordPayment, { order_id: o.json.order_id, method: "cash", amount: 3017.12, idempotency_key: randomUUID() });
    expect(over.status).toBe(400); // more than is owed
    const part = await staff(recordPayment, { order_id: o.json.order_id, method: "cash", amount: 1000, idempotency_key: randomUUID() });
    expect(part.status, JSON.stringify(part.json)).toBe(201);
    expect(part.json.balance).toBe(2017);
    const rest = await staff(recordPayment, { order_id: o.json.order_id, method: "card", amount: 2017, idempotency_key: randomUUID() });
    expect(rest.status, JSON.stringify(rest.json)).toBe(201);
    expect(rest.json.payment_status).toBe("paid");
    const row = await saved({ id: o.json.order_id });
    expect([n(row.paid_amount), n(row.total)]).toEqual([3017, 3017]);
  });

  it("payment limits come from the currency: 5,000,000 rupees is accepted by the schema for PKR, 150,000 pounds is refused for GBP", async () => {
    // (Both are refused as "more than owed" for these small orders, but only GBP is refused at the schema: 400 vs a clean overpayment 400
    // is not distinguishable, so check the message.)
    const o = await pos("takeaway");
    const pkr = await staff(recordPayment, { order_id: o.json.order_id, method: "cash", amount: 5_000_000, idempotency_key: randomUUID() });
    expect(pkr.json.error).toMatch(/more than the amount still owed/);
    const g = await staff(manualOrder, { order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: gbpItem, quantity: 1 }] }, gbpId);
    const gbp = await staff(recordPayment, { order_id: g.json.order_id, method: "cash", amount: 150_000, idempotency_key: randomUUID() }, gbpId);
    expect(gbp.status).toBe(400);
    expect(gbp.json.error).toMatch(/amount/i);
    expect(gbp.json.error).not.toMatch(/more than the amount still owed/);
  });
});

describe("Settings: rounding_step is read-only, and the money limits follow the currency", () => {
  it("rounding_step in the body is a 400 and the stored step never changes", async () => {
    const r = await staff(saveSettings, { section: "money", values: { delivery_fee: 150, min_order_value: 0, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", max_discount_percent: 20, rounding_step: 0.5 } });
    expect(r.status).toBe(400);
    expect(r.json.details[0]).toMatch(/rounding_step: read-only/);
    expect(n((await db.from("restaurants").select("rounding_step").eq("id", rid).single()).data!.rounding_step)).toBe(1);
  });

  it("a PKR restaurant can save a delivery fee of 150 and minimum order 1500; a GBP one cannot", async () => {
    const values = { delivery_fee: 150, min_order_value: 1500, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", max_discount_percent: 20 };
    expect((await staff(saveSettings, { section: "money", values })).status).toBe(200);
    expect((await staff(saveSettings, { section: "money", values }, gbpId)).status).toBe(400);
    // put the PKR minimum order back so the other tests are unaffected
    await db.from("restaurants").update({ min_order_value: null }).eq("id", rid);
  });
});
