import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { SESSION_COOKIE, createSessionToken } from "@/lib/dashboard-auth";
import { RUN_MARKER, cleanupTestOrders, db } from "./helpers/helpers";

// Needs migration 0014 applied. Uses its own throwaway restaurant (marked
// "vitest-run-...") so the demo restaurant's settings are never touched.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function place(body: Record<string, unknown>) {
  const res = await manualOrder(
    new Request("http://localhost/api/staff/manual-order", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken()}` },
      body: JSON.stringify({ restaurant_id: rid, notes: RUN_MARKER, ...body }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

let rid: string;
let itemId: string;
const items = () => [{ menu_item_id: itemId, quantity: 2 }]; // 20.00
const delivery = { order_type: "delivery", customer_name: "Vitest", customer_phone: "07700900123", delivery_address: "1 Test Road" };

const saved = async (orderId: string) =>
  (await db.from("orders").select("source, total, paid_amount, payment_status").eq("id", orderId).single()).data!;

beforeAll(async () => {
  const r = await db
    .from("restaurants")
    .insert({ name: `${RUN_MARKER}-guards`, delivery_fee: 0, max_discount_percent: 100 })
    .select("id")
    .single();
  if (r.error) throw r.error;
  rid = r.data.id;
  const m = await db.from("menu_items").insert({ restaurant_id: rid, name: "Vitest Dish", base_price: 10 }).select("id").single();
  if (m.error) throw m.error;
  itemId = m.data.id;
});

afterAll(async () => {
  await cleanupTestOrders();
  await db.from("restaurants").delete().eq("id", rid);
});

describe("order source", () => {
  it("saves 'staff_phone' for a delivery order typed in by staff", async () => {
    const { status, json } = await place({ ...delivery, items: items() });
    expect(status).toBe(201);
    expect(json.source).toBe("staff_phone");
    expect((await saved(json.order_id)).source).toBe("staff_phone");
  });

  it("keeps 'walk_in' for a takeaway order", async () => {
    const { status, json } = await place({ order_type: "takeaway", items: items() });
    expect(status).toBe(201);
    expect((await saved(json.order_id)).source).toBe("walk_in");
  });

  it("the database still refuses an unknown source", async () => {
    const { error } = await db
      .from("orders")
      .insert({ restaurant_id: rid, fulfilment_type: "pickup", subtotal: 1, total: 1, source: "banana", notes: RUN_MARKER });
    expect(error).not.toBeNull();
  });
});

describe("zero-total order", () => {
  it("a 100% discount makes the order 'paid' from the start", async () => {
    const { status, json } = await place({
      order_type: "takeaway",
      items: items(),
      discount: { type: "percent", value: 100, reason: "staff meal" },
    });
    expect(status).toBe(201);
    expect(json.total).toBe(0);
    expect(await saved(json.order_id)).toMatchObject({ total: 0, paid_amount: 0, payment_status: "paid" });
  });

  it("a normal order starts 'unpaid'", async () => {
    const { json } = await place({ order_type: "takeaway", items: items() });
    expect((await saved(json.order_id)).payment_status).toBe("unpaid");
  });
});

describe("paid_amount constraint", () => {
  it("cannot be more than the total, and cannot be negative", async () => {
    const { json } = await place({ order_type: "takeaway", items: items() }); // total 20
    const tooMuch = await db.from("orders").update({ paid_amount: 20.01 }).eq("id", json.order_id);
    expect(tooMuch.error).not.toBeNull();
    const negative = await db.from("orders").update({ paid_amount: -1 }).eq("id", json.order_id);
    expect(negative.error).not.toBeNull();
    const exact = await db.from("orders").update({ paid_amount: 20 }).eq("id", json.order_id);
    expect(exact.error).toBeNull();
  });
});
