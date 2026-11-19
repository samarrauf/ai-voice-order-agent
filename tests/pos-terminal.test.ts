import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { cartReducer, emptyCart, toOrderPayload } from "@/app/dashboard/pos/cart-store";
import { SESSION_COOKIE } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { ITEMS, RID, RUN_MARKER, cleanupTestOrders, db, sessionToken } from "./helpers/helpers";

// POS terminal part 1: the price-preview route and the takeaway path of
// manual-order. Every order made here carries RUN_MARKER ("vitest-run-...") in
// `notes`, so cleanup (and the self-heal before each run) removes only test rows.
// No table sessions are created in this file.

type Handler = (req: Request) => Promise<Response>;
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other test helpers */

async function callStaff(
  handler: Handler,
  body: unknown,
  cookie: string | null | undefined = undefined, // undefined = valid login, null = no cookie
): Promise<{ status: number; json: Record<string, any> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== null) headers.cookie = `${SESSION_COOKIE}=${cookie ?? await sessionToken()}`;
  const res = await handler(
    new Request("http://localhost/api/staff/test", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

const pence = (v: number | string) => Math.round(Number(v) * 100);
const UNKNOWN = "00000000-0000-4000-8000-000000000099";

const items = () => [
  { menu_item_id: ITEMS.pepperoni, size_name: "12 inch", quantity: 2, options: ["Extra cheese"] },
  { menu_item_id: ITEMS.garlicBread, quantity: 1 },
];

let pepperoniUnit: number; // 12 inch + extra cheese, in pounds
let garlicPrice: number;
let expectedTotal: number;

const markedOrders = async () => (await db.from("orders").select("id", { count: "exact", head: true }).like("notes", `${RUN_MARKER}%`)).count;

beforeAll(async () => {
  // Expected prices, read from the database independently of the routes.
  const [pep12, cheese, garlic] = await Promise.all([
    db.from("item_sizes").select("price").eq("menu_item_id", ITEMS.pepperoni).eq("name", "12 inch").single(),
    db.from("item_options").select("price_delta").eq("restaurant_id", RID).eq("name", "Extra Cheese").single(),
    db.from("menu_items").select("base_price").eq("id", ITEMS.garlicBread).single(),
  ]);
  const unitPence = pence(pep12.data!.price) + pence(cheese.data!.price_delta);
  pepperoniUnit = unitPence / 100;
  garlicPrice = Number(garlic.data!.base_price);
  expectedTotal = (unitPence * 2 + pence(garlic.data!.base_price)) / 100;
});

afterAll(cleanupTestOrders);

describe("price-preview", () => {
  const preview = (body: Record<string, unknown>, cookie?: string | null) =>
    callStaff(pricePreview, { restaurant_id: RID, ...body }, cookie);

  it("refuses a request with no login cookie (401)", async () => {
    const { status, json } = await preview({ items: items() }, null);
    expect(status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.total).toBeUndefined();
  });

  it("refuses a forged cookie and the voice agent's x-tool-secret", async () => {
    expect((await preview({ items: items() }, "9999999999999.notarealsignature")).status).toBe(401);
    const res = await pricePreview(
      new Request("http://localhost/api/staff/price-preview", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tool-secret": process.env.TOOL_API_SECRET! },
        body: JSON.stringify({ restaurant_id: RID, items: items() }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("prices the cart from the database, line by line, in the order sent", async () => {
    const { status, json } = await preview({ items: items() });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.total).toBe(expectedTotal);
    expect(json.subtotal).toBe(expectedTotal);
    expect(json.lines).toHaveLength(2);
    expect(json.lines[0]).toMatchObject({
      menu_item_id: ITEMS.pepperoni,
      size_name: "12 inch",
      options: ["Extra Cheese"],
      quantity: 2,
      unit_price: pepperoniUnit,
      line_total: (pence(pepperoniUnit) * 2) / 100,
    });
    expect(json.lines[1]).toMatchObject({ menu_item_id: ITEMS.garlicBread, quantity: 1, unit_price: garlicPrice, line_total: garlicPrice });
  });

  it("ignores every price the browser sends", async () => {
    const { status, json } = await preview({
      items: [{ menu_item_id: ITEMS.garlicBread, quantity: 3, price: 0.01, unit_price: 0.01, line_total: 0.01, base_price: 0.01 }],
      total: 0.01,
      subtotal: 0.01,
    });
    expect(status).toBe(200);
    expect(json.lines[0].unit_price).toBe(garlicPrice);
    expect(json.total).toBe((pence(garlicPrice) * 3) / 100);
  });

  it("rejects an item that is not on this restaurant's menu, and gives no total", async () => {
    const unknown = await preview({ items: [{ menu_item_id: UNKNOWN, quantity: 1 }] });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toMatch(/not found/);
    expect(unknown.json.total).toBeUndefined();
    // One bad item spoils the whole cart: no partial total.
    const mixed = await preview({ items: [...items(), { menu_item_id: UNKNOWN, quantity: 1 }] });
    expect(mixed.status).toBe(400);
    expect((await preview({ items: [{ menu_item_id: "not-a-uuid", quantity: 1 }] })).status).toBe(400);
  });

  it("rejects an unknown size, an unknown option, a bad quantity and an empty cart", async () => {
    expect((await preview({ items: [{ menu_item_id: ITEMS.pepperoni, size_name: "99 inch", quantity: 1 }] })).status).toBe(400);
    expect((await preview({ items: [{ menu_item_id: ITEMS.garlicBread, quantity: 1, options: ["Unicorn dust"] }] })).status).toBe(400);
    expect((await preview({ items: [{ menu_item_id: ITEMS.garlicBread, quantity: 0 }] })).status).toBe(400);
    expect((await preview({ items: [{ menu_item_id: ITEMS.garlicBread, quantity: 21 }] })).status).toBe(400);
    expect((await preview({ items: [] })).status).toBe(400);
  });

  it("saves nothing", async () => {
    const before = await db.from("orders").select("id", { count: "exact", head: true });
    await preview({ items: items(), notes: RUN_MARKER });
    const after = await db.from("orders").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });
});

describe("manual-order: takeaway (no table)", () => {
  const takeaway = (extra: Record<string, unknown> = {}, cookie?: string | null) =>
    callStaff(manualOrder, { restaurant_id: RID, order_type: "takeaway", notes: RUN_MARKER, items: items(), ...extra }, cookie);

  it("refuses a takeaway order with no login cookie", async () => {
    expect((await takeaway({}, null)).status).toBe(401);
  });

  it("creates the order without a table: source walk_in, pickup, priced from the database", async () => {
    const { status, json } = await takeaway({ customer_name: "Vitest Walk-in", customer_phone: "07700900123" });
    expect(status).toBe(201);
    expect(json.order_type).toBe("takeaway");
    expect(json.source).toBe("walk_in");
    expect(json.table_session_id).toBeNull();
    expect(json.total).toBe(expectedTotal);

    const { data: saved } = await db
      .from("orders")
      .select("source, fulfilment_type, table_session_id, status, customer_name, customer_phone, notes, subtotal, delivery_fee, total, order_items(item_name, quantity, unit_price, line_total)")
      .eq("order_number", json.order_number)
      .single();
    expect(saved!.source).toBe("walk_in");
    expect(saved!.fulfilment_type).toBe("pickup");
    expect(saved!.table_session_id).toBeNull();
    expect(saved!.status).toBe("new"); // so it shows on the Orders board
    expect(saved!.customer_name).toBe("Vitest Walk-in");
    expect(saved!.customer_phone).toBe("07700900123");
    expect(saved!.notes).toBe(RUN_MARKER);
    expect(Number(saved!.subtotal)).toBe(expectedTotal);
    expect(Number(saved!.delivery_fee)).toBe(0);
    expect(Number(saved!.total)).toBe(expectedTotal);
    expect(saved!.order_items).toHaveLength(2);
    const lineSum = saved!.order_items.reduce((s: number, i: { line_total: number | string }) => s + pence(i.line_total), 0);
    expect(lineSum / 100).toBe(expectedTotal);
  });

  it("works with no customer name or phone (both optional)", async () => {
    const { status, json } = await takeaway({ items: [{ menu_item_id: ITEMS.garlicBread, quantity: 1 }] });
    expect(status).toBe(201);
    const { data } = await db.from("orders").select("customer_name, customer_phone").eq("order_number", json.order_number).single();
    expect(data!.customer_name).toBeNull();
    expect(data!.customer_phone).toBeNull();
  });

  it("ignores any price or total sent by the browser", async () => {
    const { status, json } = await takeaway({
      items: [{ menu_item_id: ITEMS.garlicBread, quantity: 1, unit_price: 0.01, line_total: 0.01, price: 0.01 }],
      total: 0.01,
      subtotal: 0.01,
    });
    expect(status).toBe(201);
    expect(json.total).toBe(garlicPrice);
    const { data } = await db.from("orders").select("total, order_items(unit_price)").eq("order_number", json.order_number).single();
    expect(Number(data!.total)).toBe(garlicPrice);
    expect(Number(data!.order_items[0].unit_price)).toBe(garlicPrice);
  });

  it("never attaches a takeaway order to a table, even if a session id is sent", async () => {
    const { status, json } = await takeaway({ table_session_id: "00000000-0000-4000-8000-000000000000" });
    expect(status).toBe(201);
    expect(json.table_session_id).toBeNull();
  });

  it("rejects an invalid item and saves nothing", async () => {
    const before = await markedOrders();
    const { status, json } = await takeaway({ items: [{ menu_item_id: UNKNOWN, quantity: 1 }] });
    expect(status).toBe(400);
    expect(json.error).toMatch(/not found/);
    expect(await markedOrders()).toBe(before);
  });
});

describe("manual-order: dine-in still needs a table session", () => {
  it("rejects a dine-in order with no table_session_id (400) and saves nothing", async () => {
    const before = await markedOrders();
    const explicit = await callStaff(manualOrder, { restaurant_id: RID, order_type: "dine_in", notes: RUN_MARKER, items: items() });
    expect(explicit.status).toBe(400);
    expect(explicit.json.error).toMatch(/table_session_id/);
    const nulled = await callStaff(manualOrder, { restaurant_id: RID, order_type: "dine_in", table_session_id: null, notes: RUN_MARKER, items: items() });
    expect(nulled.status).toBe(400);
    expect(await markedOrders()).toBe(before);
  });

  it("treats a request with no order_type as dine-in (the old behaviour)", async () => {
    const before = await markedOrders();
    const { status, json } = await callStaff(manualOrder, { restaurant_id: RID, notes: RUN_MARKER, items: items() });
    expect(status).toBe(400);
    expect(json.error).toMatch(/table_session_id/);
    expect(await markedOrders()).toBe(before);
  });

  it("still 404s a dine-in order for a session that does not exist", async () => {
    const { status } = await callStaff(manualOrder, {
      restaurant_id: RID, order_type: "dine_in", table_session_id: "00000000-0000-4000-8000-000000000000", notes: RUN_MARKER, items: items(),
    });
    expect(status).toBe(404);
  });

  it("rejects an unknown order type (delivery is not part of the POS yet)", async () => {
    const { status } = await callStaff(manualOrder, { restaurant_id: RID, order_type: "delivery", notes: RUN_MARKER, items: items() });
    expect(status).toBe(400);
  });
});

describe("POS cart store + formatMoney (no database)", () => {
  const line = { menuItemId: ITEMS.pepperoni, name: "Pepperoni", sizeName: "12 inch", options: ["Extra Cheese"], quantity: 1 };

  it("merges the same item + size + options into one line and caps the quantity at 20", () => {
    let cart = cartReducer(emptyCart(), { type: "add", line });
    cart = cartReducer(cart, { type: "add", line: { ...line, quantity: 2 } });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(3);
    cart = cartReducer(cart, { type: "add", line: { ...line, sizeName: "10 inch" } });
    expect(cart.lines).toHaveLength(2);
    cart = cartReducer(cart, { type: "setQuantity", key: cart.lines[0].key, quantity: 99 });
    expect(cart.lines[0].quantity).toBe(20);
    cart = cartReducer(cart, { type: "remove", key: cart.lines[1].key });
    expect(cart.lines).toHaveLength(1);
  });

  it("builds an order body with no prices in it, and no table for takeaway", () => {
    let cart = cartReducer(emptyCart("takeaway"), { type: "add", line });
    cart = cartReducer(cart, { type: "setTable", table: { tableId: "t", tableNumber: "T1", sessionId: "s" } });
    cart = cartReducer(cart, { type: "setField", field: "note", value: "  less spicy " });
    const body = toOrderPayload(RID, cart);
    expect(body.order_type).toBe("takeaway");
    expect(body.table_session_id).toBeNull();
    expect(body.notes).toBe("less spicy");
    expect(body.customer_name).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/price|total/);
    expect(toOrderPayload(RID, { ...cart, orderType: "dine_in" }).table_session_id).toBe("s");
  });

  it("reset empties the cart but keeps the order type", () => {
    const cart = cartReducer(cartReducer(emptyCart("takeaway"), { type: "add", line }), { type: "reset" });
    expect(cart).toEqual(emptyCart("takeaway"));
  });

  it("formatMoney follows the currency code and never crashes on a bad one", () => {
    expect(formatMoney(8.5)).toBe("£8.50");
    expect(formatMoney(8.5, "EUR")).toBe("€8.50");
    expect(formatMoney(8.5, "not-a-currency")).toBe("£8.50");
  });
});
