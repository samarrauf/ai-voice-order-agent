import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as addRoute } from "@/app/api/staff/add-items/route";
import { POST as clearRoute } from "@/app/api/staff/clear-table/route";
import { POST as seatRoute } from "@/app/api/staff/seat-table/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as payRoute } from "@/app/api/staff/record-payment/route";
import { BILL_SETTINGS_SELECT, computeBill, pence, type BillSettingsRow } from "@/lib/order-pricing";
import { loadBoardOrders } from "@/lib/orders-board";
import { loadPrintData } from "@/lib/receipt-data";
import { buildKot } from "@/lib/receipt";
import { loadFloor } from "@/lib/tables-data";
import { BILL_UNPAID_ERROR } from "@/lib/tables";
import { RUN_MARKER, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// B4a2: add items to the running bill of a dine-in table, and the plain clear-table payment check.
// Only throwaway "vitest-run-" restaurants. Needs migration 0028 (add_items_to_order_tx, orders.items_added_at).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;
let dishId: string; // 10.00, cost 4.00
let sideId: string; // 3.50, no cost known
let counter = 0;
let settings: BillSettingsRow;

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const payKey = () => `vitest-pay-${Math.random().toString(36).slice(2)}`;
const COST = /cost|profit|margin/i;

async function seatedTable() {
  const t = await db.from("restaurant_tables").insert({ restaurant_id: A, table_number: `AI${++counter}`, seats: 4 }).select("id").single();
  if (t.error) throw t.error;
  const seat = await call(seatRoute, { table_id: t.data.id, party_size: 2 });
  expect(seat.status).toBe(201);
  return { tableId: t.data.id as string, sessionId: seat.json.session.id as string };
}
/** A seated table with one dine-in order (1 x dish = 10.00). */
async function tableWithOrder(extra: Record<string, unknown> = {}) {
  const t = await seatedTable();
  const o = await call(orderRoute, { order_type: "dine_in", table_session_id: t.sessionId, notes: RUN_MARKER, items: [{ menu_item_id: dishId, quantity: 1 }], ...extra });
  expect(o.status).toBe(201);
  return { ...t, orderId: o.json.order_id as string, orderNumber: o.json.order_number as string };
}
const orderRow = async (id: string) => (await db.from("orders").select("*").eq("id", id).single()).data as any;
const itemRows = async (id: string) => ((await db.from("order_items").select("*").eq("order_id", id).order("created_at")).data ?? []) as any[];
const events = async (orderId: string, event?: string) => {
  let q = db.from("order_events").select("*").eq("order_id", orderId);
  if (event) q = q.eq("event", event);
  return ((await q).data ?? []) as any[];
};
/** What computeBill says for these items (pence of line totals), with the restaurant's real settings. */
const expectedTotal = (subtotalPence: number, discount?: { type: "percent" | "fixed"; value: number; reason: string }) => {
  const b = computeBill(subtotalPence, "dine_in", settings, discount ?? null);
  if (!b.ok) throw new Error(b.error);
  return b.bill.totalPence / 100;
};

beforeAll(async () => {
  const rs = [] as string[];
  for (const label of ["a", "b"]) {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-ai-${label}`, tax_rate_percent: 20, max_discount_percent: 50 }).select("id").single();
    if (r.error) throw r.error;
    rs.push(r.data.id);
  }
  [A, B] = rs;
  const m = await db
    .from("menu_items")
    .insert([
      { restaurant_id: A, name: "Vitest Dish", base_price: 10 },
      { restaurant_id: A, name: "Vitest Side", base_price: 3.5 },
    ])
    .select("id, name");
  if (m.error) throw m.error;
  dishId = m.data.find((x) => x.name === "Vitest Dish")!.id;
  sideId = m.data.find((x) => x.name === "Vitest Side")!.id;
  const c = await db.from("menu_costs").insert({ restaurant_id: A, menu_item_id: dishId, cost_price: 4 });
  if (c.error) throw c.error;
  const s = await db.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", A).single();
  if (s.error) throw s.error;
  settings = s.data as unknown as BillSettingsRow;
  owner = await staffCookie(A, "owner");
  manager = await staffCookie(A, "manager");
  staff = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  await cleanupTestOrders();
  for (const rid of [A, B]) if (rid) await db.from("restaurants").delete().eq("id", rid);
});

describe("add items to a running dine-in bill", () => {
  it("needs a login", async () => {
    const t = await tableWithOrder();
    expect((await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] }, null)).status).toBe(401);
  });

  it("the total is computeBill of ALL items, earlier items keep their saved price, and the same order number stays", async () => {
    const t = await tableWithOrder();
    // The menu price changes after the first order: the old line must keep 10.00.
    await db.from("menu_items").update({ base_price: 12 }).eq("id", dishId);
    try {
      const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 2 }, { menu_item_id: sideId, quantity: 1 }] }, staff);
      expect(r.status).toBe(201);
      expect(r.json.order_number).toBe(t.orderNumber);
      const items = await itemRows(t.orderId);
      expect(items).toHaveLength(3);
      expect(Number(items[0].unit_price)).toBe(10); // the earlier line, untouched
      const subtotal = items.reduce((n, i) => n + pence(i.line_total), 0);
      expect(subtotal).toBe(1000 + 2400 + 350);
      const order = await orderRow(t.orderId);
      expect(Number(order.total)).toBe(expectedTotal(subtotal));
      expect(r.json.total).toBe(expectedTotal(subtotal));
      expect(Number(order.subtotal)).toBe(subtotal / 100);
    } finally {
      await db.from("menu_items").update({ base_price: 10 }).eq("id", dishId);
    }
  });

  it("keeps the order's own discount and works it out again on the bigger subtotal", async () => {
    const d = { type: "percent" as const, value: 10, reason: "vitest" };
    const t = await tableWithOrder({ discount: d });
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 1 }] });
    expect(r.status).toBe(201);
    expect(Number((await orderRow(t.orderId)).total)).toBe(expectedTotal(2000, d));
  });

  it("ignores any price or total the client sends", async () => {
    const t = await tableWithOrder();
    const r = await call(addRoute, { order_id: t.orderId, total: 0.01, items: [{ menu_item_id: dishId, quantity: 1, unit_price: 0.01, price: 0.01, line_total: 0.01, unit_cost: 0 }] });
    expect(r.status).toBe(201);
    const items = await itemRows(t.orderId);
    expect(Number(items[1].unit_price)).toBe(10);
    expect(Number(items[1].line_total)).toBe(10);
    expect(Number(items[1].unit_cost)).toBe(4); // from menu_costs, not from the client
  });

  it("an unknown menu item is a 400 and nothing changes", async () => {
    const t = await tableWithOrder();
    const before = await orderRow(t.orderId);
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: "33333333-0000-0000-0000-000000000001", quantity: 1 }] });
    expect(r.status).toBe(400);
    expect(Number((await orderRow(t.orderId)).total)).toBe(Number(before.total));
    expect(await itemRows(t.orderId)).toHaveLength(1);
  });

  it("an order with a payment already recorded is 409", async () => {
    const t = await tableWithOrder();
    expect((await call(payRoute, { order_id: t.orderId, method: "cash", amount: 1, idempotency_key: payKey() })).status).toBe(201);
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/payment/i);
    expect(await itemRows(t.orderId)).toHaveLength(1);
  });

  it("another restaurant's order is 404 (and a different restaurant_id in the body is 403)", async () => {
    const t = await tableWithOrder();
    const body = { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] };
    expect((await call(addRoute, body, ownerB)).status).toBe(404);
    expect((await call(addRoute, { ...body, restaurant_id: B }, owner)).status).toBe(403);
    expect(await itemRows(t.orderId)).toHaveLength(1);
  });

  it("cancelled, completed and merged orders and a cleared table are all 409", async () => {
    for (const status of ["cancelled", "completed", "merged"]) {
      const t = await tableWithOrder();
      await db.from("orders").update({ status }).eq("id", t.orderId);
      const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] });
      expect(r.status, status).toBe(409);
      expect(await itemRows(t.orderId)).toHaveLength(1);
    }
    const t = await tableWithOrder();
    await db.from("table_sessions").update({ cleared_at: new Date().toISOString() }).eq("id", t.sessionId);
    expect((await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] })).status).toBe(409);
  });

  it("a takeaway order cannot be added to (409)", async () => {
    const o = await call(orderRoute, { order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: dishId, quantity: 1 }] });
    expect(o.status).toBe(201);
    expect((await call(addRoute, { order_id: o.json.order_id, items: [{ menu_item_id: sideId, quantity: 1 }] })).status).toBe(409);
  });

  it("two staff adding at the same moment: both land and the total is right", async () => {
    const t = await tableWithOrder();
    const [x, y] = await Promise.all([
      call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] }, staff),
      call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 1 }] }, manager),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    const items = await itemRows(t.orderId);
    expect(items).toHaveLength(3);
    const subtotal = items.reduce((n, i) => n + pence(i.line_total), 0);
    expect(subtotal).toBe(1000 + 350 + 1000);
    expect(Number((await orderRow(t.orderId)).total)).toBe(expectedTotal(subtotal));
    expect(await events(t.orderId, "items_added")).toHaveLength(2);
  });
});

describe("kitchen side of an addition", () => {
  it("the ADDITION ticket lists only the new items; a ready order goes back to preparing", async () => {
    const t = await tableWithOrder();
    await db.from("orders").update({ status: "ready" }).eq("id", t.orderId);
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 2 }] });
    expect(r.status).toBe(201);
    expect(r.json.status).toBe("preparing");
    expect(r.json.back_to_kitchen).toBe(true);
    expect((await orderRow(t.orderId)).status).toBe("preparing");
    expect((await orderRow(t.orderId)).items_added_at).not.toBeNull();

    const ev = (await events(t.orderId, "items_added"))[0];
    expect(ev.id).toBe(r.json.event_id);
    const data = await loadPrintData(t.orderId, A);
    const addition = buildKot(data!, ev.detail.item_ids);
    expect(addition.addition).toBe(true);
    expect(addition.lines).toEqual([{ quantity: 2, name: "Vitest Side", options: [], notes: null }]);
    // The normal ticket still lists everything and has no ADDITION mark.
    const full = buildKot(data!);
    expect(full.addition).toBeUndefined();
    expect(full.lines.map((l) => l.name).sort()).toEqual(["Vitest Dish", "Vitest Side"]);
  });

  it("a status that is not 'ready' stays as it was", async () => {
    const t = await tableWithOrder();
    await db.from("orders").update({ status: "preparing" }).eq("id", t.orderId);
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] });
    expect(r.json.status).toBe("preparing");
    expect(r.json.back_to_kitchen).toBe(false);
  });

  it("the Orders board marks it 'new items' until the kitchen finishes it", async () => {
    const t = await tableWithOrder();
    expect((await loadBoardOrders(A, "staff")).find((o) => o.id === t.orderId)!.has_new_items).toBe(false);
    await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] });
    expect((await loadBoardOrders(A, "staff")).find((o) => o.id === t.orderId)!.has_new_items).toBe(true);
    await db.from("orders").update({ status: "ready" }).eq("id", t.orderId);
    expect((await loadBoardOrders(A, "staff")).find((o) => o.id === t.orderId)!.has_new_items).toBe(false);
  });

  it("order_events 'items_added' says who, which items and how much was added", async () => {
    const t = await tableWithOrder();
    const before = Number((await orderRow(t.orderId)).total);
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 2 }] }, manager);
    const [ev] = await events(t.orderId, "items_added");
    expect(ev).toMatchObject({ restaurant_id: A });
    expect(ev.staff_id).toBeTruthy();
    expect(ev.detail.items).toEqual([{ name: "Vitest Side", size: null, quantity: 2, line_total: 7 }]);
    expect(ev.detail.added_subtotal).toBe(7);
    expect(ev.detail.old_total).toBe(before);
    expect(ev.detail.new_total).toBe(r.json.total);
    expect(ev.detail.item_ids).toHaveLength(1);
    expect(JSON.stringify(ev.detail)).not.toMatch(COST);
  });
});

describe("cost of the new items stays owner-only", () => {
  it("is snapshotted on the saved lines and the order, and shown to the owner only", async () => {
    const t = await tableWithOrder();
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 2 }, { menu_item_id: sideId, quantity: 1 }] }, manager);
    expect(r.status).toBe(201);
    const items = await itemRows(t.orderId);
    expect(Number(items[1].unit_cost)).toBe(4);
    expect(Number(items[1].line_cost)).toBe(8);
    expect(items[2].unit_cost).toBeNull(); // the side has no cost yet: "unknown", not 0
    const order = await orderRow(t.orderId);
    expect(Number(order.cost_total)).toBe(12);
    expect(order.cost_complete).toBe(false);

    const ownerRow = (await loadBoardOrders(A, "owner")).find((o) => o.id === t.orderId)!;
    expect(ownerRow.profit).toBeTruthy();
    expect(ownerRow.items.some((i) => i.cost)).toBe(true);
    for (const role of ["manager", "staff"] as const) {
      const row = (await loadBoardOrders(A, role)).find((o) => o.id === t.orderId)!;
      expect(JSON.stringify(row), `${role} board`).not.toMatch(COST);
    }
  });

  it("no response, KOT, event or floor row of a manager or staff member carries cost or profit", async () => {
    const t = await tableWithOrder();
    for (const who of [staff, manager, owner]) {
      const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 1 }] }, who);
      expect(r.status).toBe(201);
      expect(JSON.stringify(r.json), "add-items response").not.toMatch(COST);
    }
    const data = await loadPrintData(t.orderId, A);
    expect(JSON.stringify(buildKot(data!, [data!.items[0].id as string]))).not.toMatch(COST);
    for (const ev of await events(t.orderId)) expect(JSON.stringify(ev), "order event").not.toMatch(COST);
    const floor = await loadFloor(A);
    const row = floor.tables.find((x) => x.session?.id === t.sessionId)!;
    expect(JSON.stringify(row)).not.toMatch(COST);
  });

  it("an owner who sends a cost with the items is ignored too", async () => {
    const t = await tableWithOrder();
    const r = await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: dishId, quantity: 1, unit_cost: 0, cost: 0 }] }, owner);
    expect(r.status).toBe(201);
    expect(Number((await itemRows(t.orderId))[1].unit_cost)).toBe(4);
  });
});

describe("busy table: a separate bill is allowed and logged", () => {
  it("manual-order on a busy table still works (no hard block) and writes a 'separate_bill' event", async () => {
    const t = await tableWithOrder();
    const o = await call(orderRoute, {
      order_type: "dine_in",
      table_session_id: t.sessionId,
      separate_from_order_id: t.orderId,
      notes: RUN_MARKER,
      items: [{ menu_item_id: sideId, quantity: 1 }],
    });
    expect(o.status).toBe(201);
    const [ev] = await events(o.json.order_id, "separate_bill");
    expect(ev).toBeTruthy();
    expect(ev.detail).toMatchObject({ table_session_id: t.sessionId, existing_order_id: t.orderId, existing_order_number: t.orderNumber });
    // The first bill is untouched.
    expect(await itemRows(t.orderId)).toHaveLength(1);
  });

  it("an order of another table is not accepted as 'separate_from' (order still saved, no event)", async () => {
    const t1 = await tableWithOrder();
    const t2 = await tableWithOrder();
    const o = await call(orderRoute, { order_type: "dine_in", table_session_id: t1.sessionId, separate_from_order_id: t2.orderId, notes: RUN_MARKER, items: [{ menu_item_id: sideId, quantity: 1 }] });
    expect(o.status).toBe(201);
    expect(await events(o.json.order_id, "separate_bill")).toHaveLength(0);
  });

  it("the live floor gives the POS the running bill, the minutes and the orders of a busy table", async () => {
    const t = await tableWithOrder();
    await call(addRoute, { order_id: t.orderId, items: [{ menu_item_id: sideId, quantity: 1 }] });
    const row = (await loadFloor(A)).tables.find((x) => x.session?.id === t.sessionId)!;
    expect(row.session!.bill).toBe(Number((await orderRow(t.orderId)).total));
    expect(row.session!.orders).toHaveLength(1);
    expect(row.session!.orders[0]).toMatchObject({ id: t.orderId, status: "new", paidAmount: 0 });
    expect(row.session!.minutes).toBeGreaterThanOrEqual(0);
  });
});

describe("plain clear-table checks the bill on the server", () => {
  const sessionRow = async (id: string) => (await db.from("table_sessions").select("*").eq("id", id).single()).data as any;

  it("an unpaid table: staff, manager and owner get 409 with a clear message, the table stays open", async () => {
    for (const cookie of [staff, manager, owner]) {
      const t = await tableWithOrder();
      const r = await call(clearRoute, { table_session_id: t.sessionId }, cookie);
      expect(r.status).toBe(409);
      expect(r.json.error).toBe(BILL_UNPAID_ERROR);
      expect((await sessionRow(t.sessionId)).cleared_at).toBeNull();
    }
  });

  it("a part-paid table is still unpaid", async () => {
    const t = await tableWithOrder();
    await call(payRoute, { order_id: t.orderId, method: "cash", amount: 3, idempotency_key: payKey() });
    expect((await call(clearRoute, { table_session_id: t.sessionId }, staff)).status).toBe(409);
    expect((await sessionRow(t.sessionId)).cleared_at).toBeNull();
  });

  it("a paid table and a table with no order at all clear as before", async () => {
    const paid = await tableWithOrder();
    const total = Number((await orderRow(paid.orderId)).total);
    expect((await call(payRoute, { order_id: paid.orderId, method: "cash", amount: total, idempotency_key: payKey() })).status).toBe(201);
    expect((await call(clearRoute, { table_session_id: paid.sessionId }, staff)).status).toBe(200);
    const empty = await seatedTable();
    expect((await call(clearRoute, { table_session_id: empty.sessionId }, staff)).status).toBe(200);
  });

  it("a table whose only order was cancelled or merged carries no bill and clears", async () => {
    for (const status of ["cancelled", "merged"]) {
      const t = await tableWithOrder();
      await db.from("orders").update({ status }).eq("id", t.orderId);
      expect((await call(clearRoute, { table_session_id: t.sessionId }, staff)).status, status).toBe(200);
    }
  });

  it("a booking session with no order clears (the Bookings board path); with an unpaid order it does not", async () => {
    const free = await seatedTable();
    expect((await call(clearRoute, { table_session_id: free.sessionId }, staff)).status).toBe(200);
    const withBill = await tableWithOrder();
    await db.from("table_sessions").update({ source: "booking" }).eq("id", withBill.sessionId);
    expect((await call(clearRoute, { table_session_id: withBill.sessionId }, staff)).status).toBe(409);
  });

  it("clear_unpaid: owner and manager clear an unpaid table, staff is 403", async () => {
    for (const [cookie, status] of [[owner, 200], [manager, 200], [staff, 403]] as const) {
      const t = await tableWithOrder();
      const r = await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, cookie);
      expect(r.status).toBe(status);
      expect((await sessionRow(t.sessionId)).cleared_at !== null).toBe(status === 200);
    }
  });

  it("an already cleared table is still a plain 409 'already cleared' (not the unpaid message)", async () => {
    const t = await seatedTable();
    expect((await call(clearRoute, { table_session_id: t.sessionId }, staff)).status).toBe(200);
    const again = await call(clearRoute, { table_session_id: t.sessionId }, staff);
    expect(again.status).toBe(409);
    expect(again.json.error).not.toBe(BILL_UNPAID_ERROR);
  });
});
