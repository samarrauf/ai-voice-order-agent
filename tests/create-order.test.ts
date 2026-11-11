import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tools/create-order/route";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  ITEMS, RID, RUN_MARKER, callTool, cleanupTestOrders, db, orderBody, useOpenClock, useRealClock,
} from "./helpers/helpers";

// Expected prices are read from the database here, independently of the route,
// so the tests check the route's arithmetic rather than copying it.
const pence = (v: number | string) => Math.round(Number(v) * 100);
let expected: { subtotal: number; fee: number; total: number; minOrder: number; margherita10: number };

beforeAll(async () => {
  const [pep12, cheese, garlic, marg10, restaurant] = await Promise.all([
    db.from("item_sizes").select("price").eq("menu_item_id", ITEMS.pepperoni).eq("name", "12 inch").single(),
    db.from("item_options").select("price_delta").eq("restaurant_id", RID).eq("name", "Extra Cheese").single(),
    db.from("menu_items").select("base_price").eq("id", ITEMS.garlicBread).single(),
    db.from("item_sizes").select("price").eq("menu_item_id", ITEMS.margherita).eq("name", "10 inch").single(),
    db.from("restaurants").select("delivery_fee, min_order_value").eq("id", RID).single(),
  ]);
  const subtotalP = (pence(pep12.data!.price) + pence(cheese.data!.price_delta)) * 2 + pence(garlic.data!.base_price);
  const feeP = pence(restaurant.data!.delivery_fee);
  expected = {
    subtotal: subtotalP / 100,
    fee: feeP / 100,
    total: (subtotalP + feeP) / 100,
    minOrder: pence(restaurant.data!.min_order_value),
    margherita10: pence(marg10.data!.price),
  };
});

// The route rejects orders when the restaurant is closed, so pin the clock
// to an open time. The real hours in the database are never touched.
beforeEach(useOpenClock);
afterEach(() => {
  useRealClock();
  vi.restoreAllMocks();
});
afterAll(cleanupTestOrders);

describe("create-order", () => {
  it("a valid 2-item order computes the correct subtotal, delivery fee and total", async () => {
    const { status, json } = await callTool(POST, orderBody());
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.subtotal).toBe(expected.subtotal);
    expect(json.delivery_fee).toBe(expected.fee);
    expect(json.total).toBe(expected.total);
    expect(json.speech).toContain(expected.total.toFixed(2));
    expect(json.speech).not.toContain("£");

    // What was saved must match what was spoken.
    const { data: saved } = await db
      .from("orders")
      .select("subtotal, delivery_fee, total, order_items(quantity)")
      .eq("order_number", json.order_number)
      .single();
    expect(Number(saved!.total)).toBe(expected.total);
    expect(saved!.order_items).toHaveLength(2);
  });

  it('a body containing "total": 0.01 is ignored and the correct total is returned', async () => {
    const { status, json } = await callTool(POST, { ...orderBody(), total: 0.01, subtotal: 0.01 });
    expect(status).toBe(200);
    expect(json.total).toBe(expected.total);
    const { data: saved } = await db.from("orders").select("total").eq("order_number", json.order_number).single();
    expect(Number(saved!.total)).toBe(expected.total);
  });

  it("delivery below min_order_value is rejected, naming the shortfall", async () => {
    const { status, json } = await callTool(
      POST,
      orderBody({ items: [{ menu_item_id: ITEMS.margherita, size_name: "10 inch", quantity: 1, options: [] }] }),
    );
    const shortfall = ((expected.minOrder - expected.margherita10) / 100).toFixed(2); // 4.01
    expect(status).toBe(400);
    expect(json.speech).toContain(shortfall);
  });

  it("an unavailable item is rejected, naming the item", async () => {
    await db.from("menu_items").update({ is_available: false }).eq("id", ITEMS.coleslaw);
    try {
      const { status, json } = await callTool(
        POST,
        orderBody({
          fulfilment_type: "pickup",
          items: [{ menu_item_id: ITEMS.coleslaw, size_name: null, quantity: 1, options: [] }],
        }),
      );
      expect(status).toBe(400);
      expect(json.speech).toContain("Coleslaw");
    } finally {
      await db.from("menu_items").update({ is_available: true }).eq("id", ITEMS.coleslaw);
    }
  });

  it("delivery with no postcode is rejected", async () => {
    const { status, json } = await callTool(POST, orderBody({ delivery_postcode: null }));
    expect(status).toBe(400);
    expect(json.speech).toMatch(/postcode/i);
  });

  it("quantity 50 is rejected", async () => {
    const body = orderBody();
    body.items[0].quantity = 50;
    const { status, json } = await callTool(POST, body);
    expect(status).toBe(400);
    expect(json.speech).toMatch(/twenty/i);
  });

  it("when the order RPC fails, no partial order and no orphan order_items remain", async () => {
    // 1) The real database function: item 1 is valid, item 2 breaks a constraint
    //    (quantity 0). The order row is inserted first, so if the function weren't
    //    one transaction, the order and item 1 would be left behind.
    const marker = `${RUN_MARKER}-atomic`;
    const { error } = await db.rpc("create_order_tx", {
      p_order: {
        restaurant_id: RID, fulfilment_type: "pickup", customer_name: "Vitest", customer_phone: "07700900123",
        subtotal: 1, delivery_fee: 0, total: 1, payment_method: "cash", notes: marker,
      },
      p_items: [
        { menu_item_id: ITEMS.coleslaw, item_name: marker, quantity: 1, unit_price: 1, line_total: 1, options: [] },
        { menu_item_id: ITEMS.coleslaw, item_name: marker, quantity: 0, unit_price: 1, line_total: 0, options: [] },
      ],
    });
    expect(error).not.toBeNull();
    const orders = await db.from("orders").select("id", { count: "exact", head: true }).eq("notes", marker);
    const items = await db.from("order_items").select("id", { count: "exact", head: true }).eq("item_name", marker);
    expect(orders.count).toBe(0);
    expect(items.count).toBe(0);

    // 2) The route: if the RPC errors, the caller hears a friendly message, not a crash.
    const routeMarker = `${RUN_MARKER}-route-fail`;
    vi.spyOn(supabaseAdmin, "rpc").mockResolvedValueOnce({
      data: null, error: { message: "simulated failure" }, count: null, status: 500, statusText: "error",
    } as never);
    const { status, json } = await callTool(POST, orderBody({ notes: routeMarker }));
    expect(status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.speech).toMatch(/sorry/i);
    const routeOrders = await db.from("orders").select("id", { count: "exact", head: true }).eq("notes", routeMarker);
    expect(routeOrders.count).toBe(0);
  });
});
