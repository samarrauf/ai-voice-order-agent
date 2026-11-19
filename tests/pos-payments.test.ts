import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as recordPayment } from "@/app/api/staff/record-payment/route";
import { SESSION_COOKIE } from "@/lib/session";
import { computeBill, discountSchema, percentOf, roundPence, type BillSettingsRow } from "@/lib/order-pricing";
import { RID, RUN_MARKER, cleanupTestOrders, db, sessionToken } from "./helpers/helpers";

// POS P2a: the bill (discount, delivery fee, service charge, tax, rounding) and
// payments. The pure maths is tested directly; the routes are tested against a
// THROWAWAY restaurant (name starts with "vitest-run-", so the self-heal in
// tests/helpers/global-setup.ts removes it if a run is interrupted) so the real
// restaurant's settings are never touched. Its orders carry RUN_MARKER in `notes`.
// Needs migration 0013 applied.

type Handler = (req: Request) => Promise<Response>;
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other test helpers */

async function callStaff(
  handler: Handler,
  body: unknown,
  cookie: string | null | undefined = undefined, // undefined = valid login, null = no cookie
): Promise<{ status: number; json: Record<string, any> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== null) headers.cookie = `${SESSION_COOKIE}=${cookie ?? sessionToken(rid)}`;
  const res = await handler(
    new Request("http://localhost/api/staff/test", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

// ---------------------------------------------------------------------------
// 1. The maths, no database
// ---------------------------------------------------------------------------
const settings = (o: Partial<BillSettingsRow> = {}): BillSettingsRow => ({
  delivery_fee: 2.5,
  tax_rate_percent: 0,
  service_charge_percent: 0,
  service_charge_applies_to: "none",
  max_discount_percent: 0,
  ...o,
});
const bill = (...args: Parameters<typeof computeBill>) => {
  const r = computeBill(...args);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.bill;
};

describe("computeBill: discount", () => {
  it("no discount, no extras: total equals the subtotal", () => {
    expect(bill(2000, "takeaway", settings()).totalPence).toBe(2000);
  });

  it("percent discount comes off the subtotal", () => {
    const b = bill(2000, "takeaway", settings({ max_discount_percent: 50 }), { type: "percent", value: 10, reason: "regular" });
    expect(b.discountPence).toBe(200);
    expect(b.totalPence).toBe(1800);
    expect(b.discount.reason).toBe("regular");
  });

  it("fixed discount comes off the subtotal", () => {
    const b = bill(2000, "takeaway", settings({ max_discount_percent: 50 }), { type: "fixed", value: 3.5, reason: null });
    expect(b.discountPence).toBe(350);
    expect(b.totalPence).toBe(1650);
  });

  it("rejects a discount above the restaurant's maximum percent", () => {
    const s = settings({ max_discount_percent: 10 });
    expect(computeBill(2000, "takeaway", s, { type: "percent", value: 10.01, reason: null }).ok).toBe(false);
    expect(computeBill(2000, "takeaway", s, { type: "fixed", value: 2.01, reason: null }).ok).toBe(false);
    expect(computeBill(2000, "takeaway", s, { type: "fixed", value: 2, reason: null }).ok).toBe(true); // exactly the cap
  });

  it("rejects every discount while max_discount_percent is 0 (the default)", () => {
    expect(computeBill(2000, "takeaway", settings(), { type: "percent", value: 1, reason: null }).ok).toBe(false);
  });

  it("never lets a discount exceed the subtotal, even with a 100% cap", () => {
    const s = settings({ max_discount_percent: 100 });
    expect(computeBill(2000, "takeaway", s, { type: "fixed", value: 20.01, reason: null }).ok).toBe(false);
    expect(computeBill(2000, "takeaway", s, { type: "percent", value: 100.5, reason: null }).ok).toBe(false);
    expect(bill(2000, "takeaway", s, { type: "fixed", value: 20, reason: null }).totalPence).toBe(0);
  });

  it("rejects a zero or negative discount value", () => {
    const s = settings({ max_discount_percent: 100 });
    expect(computeBill(2000, "takeaway", s, { type: "percent", value: 0, reason: null }).ok).toBe(false);
    expect(computeBill(2000, "takeaway", s, { type: "fixed", value: -1, reason: null }).ok).toBe(false);
  });
});

describe("computeBill: delivery fee", () => {
  it("is added to delivery orders only", () => {
    expect(bill(2000, "delivery", settings()).deliveryPence).toBe(250);
    expect(bill(2000, "delivery", settings()).totalPence).toBe(2250);
    expect(bill(2000, "takeaway", settings()).deliveryPence).toBe(0);
    expect(bill(2000, "dine_in", settings()).deliveryPence).toBe(0);
  });

  it("refuses a delivery order when the restaurant has no delivery fee set", () => {
    expect(computeBill(2000, "delivery", settings({ delivery_fee: null })).ok).toBe(false);
    expect(computeBill(2000, "takeaway", settings({ delivery_fee: null })).ok).toBe(true);
  });
});

describe("computeBill: service charge", () => {
  const sc = (applies: string) => settings({ service_charge_percent: 10, service_charge_applies_to: applies });
  it("'none' never charges", () => {
    for (const kind of ["dine_in", "takeaway", "delivery"] as const) expect(bill(2000, kind, sc("none")).serviceChargePence).toBe(0);
  });
  it("'dine_in' charges dine-in orders only", () => {
    expect(bill(2000, "dine_in", sc("dine_in")).serviceChargePence).toBe(200);
    expect(bill(2000, "takeaway", sc("dine_in")).serviceChargePence).toBe(0);
    expect(bill(2000, "delivery", sc("dine_in")).serviceChargePence).toBe(0);
  });
  it("'all' charges every order type", () => {
    for (const kind of ["dine_in", "takeaway", "delivery"] as const) expect(bill(2000, kind, sc("all")).serviceChargePence).toBe(200);
  });
  it("is worked out on the food after the discount, not on delivery", () => {
    const s = { ...sc("all"), max_discount_percent: 50 };
    const b = bill(2000, "delivery", s, { type: "percent", value: 10, reason: null });
    expect(b.serviceChargePence).toBe(180); // 10% of 18.00
  });
});

describe("computeBill: tax", () => {
  it("adds nothing at 0% (the default)", () => {
    expect(bill(2000, "dine_in", settings()).taxPence).toBe(0);
  });
  it("is worked out from the rate in the settings, on the whole bill", () => {
    const s = settings({ tax_rate_percent: 20, service_charge_percent: 10, service_charge_applies_to: "all", max_discount_percent: 50 });
    const b = bill(2000, "delivery", s, { type: "fixed", value: 5, reason: null });
    // food 15.00 + delivery 2.50 + service 1.50 = 19.00; tax 20% = 3.80
    expect(b.serviceChargePence).toBe(150);
    expect(b.taxPence).toBe(380);
    expect(b.totalPence).toBe(1500 + 250 + 150 + 380);
  });
  it("uses whatever rate is set, e.g. 5%", () => {
    expect(bill(1000, "takeaway", settings({ tax_rate_percent: 5 })).taxPence).toBe(50);
  });
});

describe("rounding", () => {
  it("rounds once, half up, to a whole penny", () => {
    expect(roundPence(2.5)).toBe(3);
    expect(roundPence(2.49)).toBe(2);
    expect(percentOf(25, 10)).toBe(3); // 2.5p -> 3p
    expect(percentOf(999, 20)).toBe(200); // 199.8p -> 200p
  });
  it("total is always whole pence and equals the sum of its rounded parts", () => {
    const b = bill(999, "delivery", settings({ tax_rate_percent: 20, service_charge_percent: 12.5, service_charge_applies_to: "all" }));
    for (const v of [b.discountPence, b.deliveryPence, b.serviceChargePence, b.taxPence, b.totalPence]) expect(Number.isInteger(v)).toBe(true);
    expect(b.totalPence).toBe(b.subtotalPence - b.discountPence + b.deliveryPence + b.serviceChargePence + b.taxPence);
  });
});

// ---------------------------------------------------------------------------
// 2. The routes, against a throwaway restaurant
// ---------------------------------------------------------------------------
let rid: string;
let itemId: string; // 10.00, no sizes
const PRICE = 10;

const configure = async (patch: Record<string, unknown>) => {
  const { error } = await db.from("restaurants").update(patch).eq("id", rid);
  if (error) throw error;
};
const RESET = {
  delivery_fee: 2.5,
  tax_rate_percent: 0,
  service_charge_percent: 0,
  service_charge_applies_to: "none",
  max_discount_percent: 0,
};
const cart = (qty = 2) => [{ menu_item_id: itemId, quantity: qty }]; // 20.00
const place = (extra: Record<string, unknown> = {}) =>
  callStaff(manualOrder, { restaurant_id: rid, order_type: "takeaway", notes: RUN_MARKER, items: cart(), ...extra });
const delivery = { order_type: "delivery", customer_name: "Vitest", customer_phone: "07700900123", delivery_address: "1 Test Road" };

beforeAll(async () => {
  const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-pay`, ...RESET }).select("id").single();
  if (r.error) throw r.error;
  rid = r.data.id;
  const m = await db.from("menu_items").insert({ restaurant_id: rid, name: "Vitest Dish", base_price: PRICE }).select("id").single();
  if (m.error) throw m.error;
  itemId = m.data.id;
});

afterAll(async () => {
  await cleanupTestOrders(); // order_payments go with their orders
  await db.from("restaurants").delete().eq("id", rid); // menu items go with it
});

describe("price-preview: the whole breakdown", () => {
  it("returns subtotal, discount, delivery, service charge, tax and total, all from the server", async () => {
    await configure({ ...RESET, tax_rate_percent: 20, service_charge_percent: 10, service_charge_applies_to: "all", max_discount_percent: 50 });
    const { status, json } = await callStaff(pricePreview, {
      restaurant_id: rid,
      order_type: "delivery",
      discount: { type: "fixed", value: 5, reason: "test" },
      items: cart(),
    });
    expect(status).toBe(200);
    // food 20 - 5 = 15; delivery 2.50; service 1.50; tax 20% of 19.00 = 3.80
    expect(json).toMatchObject({ subtotal: 20, discount: 5, delivery_fee: 2.5, service_charge: 1.5, tax: 3.8, total: 22.8 });
    expect(json.lines).toHaveLength(1);
  });

  it("rejects a discount above the maximum with a 400", async () => {
    await configure({ ...RESET, max_discount_percent: 10 });
    const { status, json } = await callStaff(pricePreview, {
      restaurant_id: rid,
      discount: { type: "percent", value: 25, reason: null },
      items: cart(),
    });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/discount/);
  });
});

describe("manual-order: charges are calculated by the server", () => {
  it("ignores any total, tax, discount amount or delivery fee the browser sends", async () => {
    await configure({ ...RESET, tax_rate_percent: 20 });
    const { status, json } = await place({
      total: 0.01,
      subtotal: 0.01,
      tax_amount: 0,
      tax: 0,
      discount_amount: 15,
      delivery_fee: 0,
      service_charge_amount: 0,
      items: [{ menu_item_id: itemId, quantity: 2, price: 0.01, unit_price: 0.01, line_total: 0.01 }],
    });
    expect(status).toBe(201);
    expect(json.subtotal).toBe(20);
    expect(json.tax).toBe(4);
    expect(json.total).toBe(24);
    const saved = await db.from("orders").select("subtotal, tax_amount, discount_amount, total, payment_status, paid_amount").eq("id", json.order_id).single();
    expect(Number(saved.data!.total)).toBe(24);
    expect(Number(saved.data!.tax_amount)).toBe(4);
    expect(Number(saved.data!.discount_amount)).toBe(0);
    expect(saved.data).toMatchObject({ payment_status: "unpaid" });
    expect(Number(saved.data!.paid_amount)).toBe(0);
  });

  it("works with tax at 0 (total = subtotal)", async () => {
    await configure(RESET);
    const { status, json } = await place();
    expect(status).toBe(201);
    expect(json).toMatchObject({ subtotal: 20, tax: 0, total: 20 });
  });

  it("delivery order: needs name, phone and address", async () => {
    await configure(RESET);
    for (const missing of ["customer_name", "customer_phone", "delivery_address"]) {
      const { status, json } = await place({ ...delivery, [missing]: "" });
      expect(status).toBe(400);
      expect(json.error).toContain(missing);
    }
  });

  it("delivery order: adds the delivery fee and saves a delivery order with the address", async () => {
    await configure(RESET);
    const { status, json } = await place({ ...delivery, delivery_postcode: "M1 1AA" });
    expect(status).toBe(201);
    expect(json).toMatchObject({ delivery_fee: 2.5, total: 22.5 });
    const saved = await db.from("orders").select("fulfilment_type, delivery_address, delivery_postcode, delivery_fee").eq("id", json.order_id).single();
    expect(saved.data).toMatchObject({ fulfilment_type: "delivery", delivery_address: "1 Test Road", delivery_postcode: "M1 1AA" });
    expect(Number(saved.data!.delivery_fee)).toBe(2.5);
  });

  it("takeaway order: no delivery fee, even if one is configured", async () => {
    await configure(RESET);
    const { json } = await place();
    expect(json.delivery_fee).toBe(0);
    expect(json.total).toBe(20);
  });

  it("saves an allowed discount with its reason; rejects one over the cap and saves nothing", async () => {
    await configure({ ...RESET, max_discount_percent: 15 });
    const ok = await place({ discount: { type: "percent", value: 10, reason: "vitest regular" } });
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ discount: 2, total: 18 });
    const saved = await db.from("orders").select("discount_type, discount_value, discount_amount, discount_reason").eq("id", ok.json.order_id).single();
    expect(saved.data).toMatchObject({ discount_type: "percent", discount_reason: "vitest regular" });
    expect(Number(saved.data!.discount_amount)).toBe(2);

    const before = (await db.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid)).count;
    const bad = await place({ discount: { type: "percent", value: 16, reason: null } });
    expect(bad.status).toBe(400);
    const tooBig = await place({ discount: { type: "fixed", value: 21, reason: null } });
    expect(tooBig.status).toBe(400);
    const after = (await db.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid)).count;
    expect(after).toBe(before);
  });

  it("applies service charge by its setting (dine_in only: takeaway pays none)", async () => {
    await configure({ ...RESET, service_charge_percent: 10, service_charge_applies_to: "dine_in" });
    const { json } = await place();
    expect(json.service_charge).toBe(0);
    expect(json.total).toBe(20);
  });
});

describe("record-payment", () => {
  const payBody = (orderId: string, extra: Record<string, unknown> = {}) => ({
    restaurant_id: rid,
    order_id: orderId,
    method: "cash",
    amount: 5,
    idempotency_key: crypto.randomUUID(),
    ...extra,
  });
  const newOrder = async () => {
    await configure(RESET);
    const { json } = await place(); // total 20.00
    return json.order_id as string;
  };

  it("refuses a request with no login (401)", async () => {
    const id = await newOrder();
    expect((await callStaff(recordPayment, payBody(id), null)).status).toBe(401);
  });

  it("a full payment marks the order paid", async () => {
    const id = await newOrder();
    const { status, json } = await callStaff(recordPayment, payBody(id, { amount: 20, reference: "vitest-ref" }));
    expect(status).toBe(201);
    expect(json).toMatchObject({ success: true, payment_status: "paid", paid_amount: 20, total: 20, balance: 0, duplicate: false });
    const row = await db.from("orders").select("payment_status, paid_amount").eq("id", id).single();
    expect(row.data).toMatchObject({ payment_status: "paid" });
    const pay = await db.from("order_payments").select("method, amount, reference").eq("order_id", id);
    expect(pay.data).toHaveLength(1);
    expect(pay.data![0]).toMatchObject({ method: "cash", reference: "vitest-ref" });
  });

  it("split payment: partial, then paid, across different methods", async () => {
    const id = await newOrder();
    const first = await callStaff(recordPayment, payBody(id, { amount: 12.5, method: "card" }));
    expect(first.json).toMatchObject({ payment_status: "partial", paid_amount: 12.5, balance: 7.5 });
    const second = await callStaff(recordPayment, payBody(id, { amount: 7.5, method: "cash" }));
    expect(second.json).toMatchObject({ payment_status: "paid", paid_amount: 20, balance: 0 });
    const pay = await db.from("order_payments").select("method").eq("order_id", id);
    expect(pay.data!.map((p) => p.method).sort()).toEqual(["card", "cash"]);
  });

  it("rejects overpayment (400) and records nothing", async () => {
    const id = await newOrder();
    const { status, json } = await callStaff(recordPayment, payBody(id, { amount: 20.01 }));
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    await callStaff(recordPayment, payBody(id, { amount: 15 }));
    const over = await callStaff(recordPayment, payBody(id, { amount: 5.01 }));
    expect(over.status).toBe(400);
    const row = await db.from("orders").select("payment_status, paid_amount").eq("id", id).single();
    expect(row.data).toMatchObject({ payment_status: "partial" });
    expect(Number(row.data!.paid_amount)).toBe(15);
    expect((await db.from("order_payments").select("id").eq("order_id", id)).data).toHaveLength(1);
  });

  it("refuses another payment on an order that is already paid (409)", async () => {
    const id = await newOrder();
    await callStaff(recordPayment, payBody(id, { amount: 20 }));
    expect((await callStaff(recordPayment, payBody(id, { amount: 1 }))).status).toBe(409);
  });

  it("the same idempotency key twice records ONE payment", async () => {
    const id = await newOrder();
    const body = payBody(id, { amount: 8 });
    const first = await callStaff(recordPayment, body);
    const again = await callStaff(recordPayment, body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ duplicate: true, paid_amount: 8, payment_status: "partial" });
    expect((await db.from("order_payments").select("id").eq("order_id", id)).data).toHaveLength(1);
  });

  it("two payments at the same moment can never add up to more than the total", async () => {
    const id = await newOrder();
    const results = await Promise.all([
      callStaff(recordPayment, payBody(id, { amount: 15 })),
      callStaff(recordPayment, payBody(id, { amount: 15 })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const row = await db.from("orders").select("paid_amount").eq("id", id).single();
    expect(Number(row.data!.paid_amount)).toBe(15);
  });

  it("rejects bad input: zero, negative, 3 decimals, bad method, missing key", async () => {
    const id = await newOrder();
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.005 }, { method: "bitcoin" }, { idempotency_key: "" }]) {
      expect((await callStaff(recordPayment, payBody(id, bad))).status).toBe(400);
    }
    expect((await db.from("order_payments").select("id").eq("order_id", id)).data).toHaveLength(0);
  });

  it("tenant isolation: another restaurant cannot pay this order", async () => {
    const id = await newOrder();
    // P8a: the restaurant comes from the login, so "another restaurant" = a login of the demo restaurant.
    const { status, json } = await callStaff(recordPayment, payBody(id, { restaurant_id: RID }), sessionToken(RID));
    expect(status).toBe(404);
    expect(json.success).toBe(false);
    expect((await db.from("order_payments").select("id").eq("order_id", id)).data).toHaveLength(0);
    const row = await db.from("orders").select("payment_status").eq("id", id).single();
    expect(row.data).toMatchObject({ payment_status: "unpaid" });
  });

  it("an unknown order is a 404", async () => {
    expect((await callStaff(recordPayment, payBody("00000000-0000-4000-8000-000000000099"))).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 3. Money review (after P2a): edge cases found in the review
// ---------------------------------------------------------------------------
describe("money review: discount cap survives rounding", () => {
  const s = settings({ max_discount_percent: 10 });
  it("a fixed discount cannot sneak past the cap by half a penny", () => {
    // 10% of 10.05 is 100.5p. 101p is over the cap; 100p is not.
    expect(computeBill(1005, "takeaway", s, { type: "fixed", value: 1.01, reason: null }).ok).toBe(false);
    expect(computeBill(1005, "takeaway", s, { type: "fixed", value: 1, reason: null }).ok).toBe(true);
  });
  it("a percent discount equal to the cap is rounded DOWN, so it never exceeds the cap in pence", () => {
    expect(bill(1005, "takeaway", s, { type: "percent", value: 10, reason: null }).discountPence).toBe(100);
  });
});

describe("money review: bad numbers never produce a bill", () => {
  it("discount values with more than 2 decimals are rejected by the schema", () => {
    expect(discountSchema.safeParse({ type: "percent", value: 10.123 }).success).toBe(false);
    expect(discountSchema.safeParse({ type: "fixed", value: 5.005 }).success).toBe(false);
    expect(discountSchema.safeParse({ type: "fixed", value: 5.01 }).success).toBe(true);
    expect(discountSchema.safeParse({ type: "percent", value: 12.5 }).success).toBe(true);
  });
  it("NaN / Infinity discount (bypassing the schema) is refused, never a NaN total", () => {
    const s = settings({ max_discount_percent: 100 });
    for (const value of [NaN, Infinity]) {
      for (const type of ["percent", "fixed"] as const) {
        expect(computeBill(2000, "takeaway", s, { type, value, reason: null }).ok).toBe(false);
      }
    }
  });
  it("a negative subtotal or negative delivery fee is refused", () => {
    expect(computeBill(-100, "takeaway", settings()).ok).toBe(false);
    expect(computeBill(2000, "delivery", settings({ delivery_fee: -2 })).ok).toBe(false);
  });
  it("broken settings (NaN rates) are refused", () => {
    expect(computeBill(2000, "takeaway", settings({ tax_rate_percent: "abc" })).ok).toBe(false);
  });
});

describe("money review: routes", () => {
  it("delivery order: a phone number without digits is rejected", async () => {
    await configure(RESET);
    const { status, json } = await place({ ...delivery, customer_phone: "call me" });
    expect(status).toBe(400);
    expect(json.error).toContain("customer_phone");
  });

  it("record-payment: the same key with a DIFFERENT amount is a conflict (409), not a silent 'duplicate'", async () => {
    await configure(RESET);
    const { json } = await place(); // total 20.00
    const id = json.order_id as string;
    const key = crypto.randomUUID();
    const base = { restaurant_id: rid, order_id: id, method: "cash", idempotency_key: key };
    expect((await callStaff(recordPayment, { ...base, amount: 5 })).status).toBe(201);
    const clash = await callStaff(recordPayment, { ...base, amount: 7 });
    expect(clash.status).toBe(409);
    expect(clash.json.success).toBe(false);
    // a different method with the same key and amount is also a clash
    expect((await callStaff(recordPayment, { ...base, amount: 5, method: "card" })).status).toBe(409);
    // the exact same request is still a harmless duplicate
    expect((await callStaff(recordPayment, { ...base, amount: 5 })).status).toBe(200);
    const row = await db.from("orders").select("paid_amount").eq("id", id).single();
    expect(Number(row.data!.paid_amount)).toBe(5);
  });
});
