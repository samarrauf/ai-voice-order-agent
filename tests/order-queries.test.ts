import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as lookupOrder } from "@/app/api/tools/lookup-order/route";
import { POST as createQuery } from "@/app/api/tools/create-order-query/route";
import { RID, RUN_MARKER, callTool, cleanupTestOrders, db } from "./helpers/helpers";

// Needs 0007_order_queries.sql applied to the Supabase project.
// The test order is inserted directly and carries RUN_MARKER in `notes`;
// deleting it also deletes its order_queries rows (on delete cascade).

const PHONE = "07700900321";
const WRONG_PHONE = "07700900999";
let orderNumber: string;

beforeAll(async () => {
  const { data: order, error } = await db
    .from("orders")
    .insert({
      restaurant_id: RID,
      fulfilment_type: "pickup",
      customer_name: "Vitest Customer",
      customer_phone: PHONE,
      subtotal: 17.98,
      total: 17.98,
      notes: RUN_MARKER,
    })
    .select("id, order_number")
    .single();
  if (error) throw error;
  orderNumber = order.order_number;
  const { error: itemsError } = await db.from("order_items").insert([
    { order_id: order.id, item_name: "Margherita", quantity: 2, unit_price: 8.99, line_total: 17.98 },
  ]);
  if (itemsError) throw itemsError;
});
afterAll(cleanupTestOrders);

const queryBody = (overrides: Record<string, unknown> = {}) => ({
  restaurant_id: RID,
  order_number: orderNumber,
  customer_phone: PHONE,
  query_type: "complaint",
  description: "The pizza arrived cold and one topping was missing.",
  ...overrides,
});

const queryCount = async () => {
  const { data: order } = await db.from("orders").select("id").eq("order_number", orderNumber).single();
  const { count } = await db.from("order_queries").select("id", { count: "exact", head: true }).eq("order_id", order!.id);
  return count;
};

describe("lookup-order", () => {
  it("finds the order when the number and phone both match", async () => {
    const { status, json } = await callTool(lookupOrder, { restaurant_id: RID, order_number: orderNumber, customer_phone: PHONE });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.order.order_number).toBe(orderNumber);
    expect(json.order.items).toEqual([{ name: "Margherita", quantity: 2 }]);
    expect(json.order.total).toBe("17.98");
    expect(json.order.order_type).toBe("pickup");
    expect(json.speech).not.toMatch(/£/);
  });

  it("accepts the phone in another format (+44 / spaces)", async () => {
    const { status } = await callTool(lookupOrder, { restaurant_id: RID, order_number: orderNumber, customer_phone: "+44 7700 900 321" });
    expect(status).toBe(200);
  });

  it("does not find the order with the WRONG phone, and the answer is identical to a wrong order number", async () => {
    const wrongPhone = await callTool(lookupOrder, { restaurant_id: RID, order_number: orderNumber, customer_phone: WRONG_PHONE });
    const wrongNumber = await callTool(lookupOrder, { restaurant_id: RID, order_number: "A-999999", customer_phone: PHONE });
    expect(wrongPhone.status).toBe(404);
    expect(wrongPhone.json.success).toBe(false);
    expect(wrongPhone.json.order).toBeUndefined();
    // Same status and same body: the caller can't tell which part was wrong.
    expect(wrongPhone.status).toBe(wrongNumber.status);
    expect(wrongPhone.json).toEqual(wrongNumber.json);
  });

  it("does not find a wrong order number", async () => {
    const { status, json } = await callTool(lookupOrder, { restaurant_id: RID, order_number: "A-999999", customer_phone: PHONE });
    expect(status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("rejects a request without the tool secret", async () => {
    const { status } = await callTool(lookupOrder, { restaurant_id: RID, order_number: orderNumber, customer_phone: PHONE }, null);
    expect(status).toBe(401);
  });
});

describe("create-order-query", () => {
  it("saves a query for a verified order and returns a Q- reference", async () => {
    const before = await queryCount();
    const { status, json } = await callTool(createQuery, queryBody());
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reference_number).toMatch(/^Q-\d+$/);
    expect(json.speech).not.toMatch(/£/);
    expect(await queryCount()).toBe(before! + 1);

    const { data } = await db.from("order_queries").select("query_type, status").eq("reference_number", json.reference_number).single();
    expect(data).toEqual({ query_type: "complaint", status: "new" });
  });

  it("rejects it when the phone does not match, saving nothing", async () => {
    const before = await queryCount();
    const { status, json } = await callTool(createQuery, queryBody({ customer_phone: WRONG_PHONE }));
    expect(status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.reference_number).toBeUndefined();
    expect(await queryCount()).toBe(before);
  });

  it.each(["", "x", "   "])("rejects an empty or tiny description %j, saving nothing", async (description) => {
    const before = await queryCount();
    const { status, json } = await callTool(createQuery, queryBody({ description }));
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(await queryCount()).toBe(before);
  });

  it("rejects an unknown query_type", async () => {
    const { status } = await callTool(createQuery, queryBody({ query_type: "discount" }));
    expect(status).toBe(400);
  });

  it("rejects a request without the tool secret", async () => {
    const { status } = await callTool(createQuery, queryBody(), null);
    expect(status).toBe(401);
  });
});
