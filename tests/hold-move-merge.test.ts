import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as heldRoute } from "@/app/api/staff/held-carts/route";
import { POST as moveRoute } from "@/app/api/staff/move-table/route";
import { POST as mergeRoute } from "@/app/api/staff/merge-orders/route";
import { POST as seatRoute } from "@/app/api/staff/seat-table/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as payRoute } from "@/app/api/staff/record-payment/route";
import { BILL_SETTINGS_SELECT, computeBill, type BillSettingsRow } from "@/lib/order-pricing";
import { loadBoardOrders } from "@/lib/orders-board";
import { loadFloor } from "@/lib/tables-data";
import { orderSalesPence, totalsFor } from "@/lib/dashboard-stats";
import { RUN_MARKER, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// B4a: hold / resume, move a table, merge two orders. Needs migration 0027.
// Only throwaway restaurants ("vitest-run-..."); Napoli and Olive are never touched.
// Orders carry RUN_MARKER in `notes`, so cleanupTestOrders removes them before the restaurants.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;
let dishId: string; // 10.00
let sideId: string; // 5.00
let counter = 0;

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

async function addTable(rid: string, seats = 4) {
  const r = await db.from("restaurant_tables").insert({ restaurant_id: rid, table_number: `V${++counter}`, seats }).select("id, table_number").single();
  if (r.error) throw r.error;
  return r.data as { id: string; table_number: string };
}
async function seatAt(tableId: string, party = 2) {
  const r = await call(seatRoute, { table_id: tableId, party_size: party });
  expect(r.status).toBe(201);
  return r.json.session.id as string;
}
async function orderOn(sessionId: string, items: { id: string; qty: number }[], over: Record<string, unknown> = {}, cookie = owner) {
  const r = await call(
    orderRoute,
    { order_type: "dine_in", table_session_id: sessionId, notes: RUN_MARKER, items: items.map((i) => ({ menu_item_id: i.id, quantity: i.qty })), ...over },
    cookie,
  );
  expect(r.status).toBe(201);
  return r.json.order_id as string;
}
// JSON KEYS only: an item may be called "Costed" and that is fine.
const NO_COST_KEYS = /"[a-z_]*(cost|profit)[a-z_]*"s*:/i;
const orderRow = async (id: string) => (await db.from("orders").select("*").eq("id", id).single()).data as any;
const sessionRow = async (id: string) => (await db.from("table_sessions").select("*").eq("id", id).single()).data as any;
const events = async (orderId: string) => ((await db.from("order_events").select("*").eq("order_id", orderId).order("created_at")).data ?? []) as any[];
const settings = async () => (await db.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", A).single()).data as unknown as BillSettingsRow;

/** A cart as the POS sends it to /held-carts (no prices). */
const cartOf = (menuItemId: string, qty = 1, table: unknown = null) => ({
  orderType: "takeaway",
  table,
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryPostcode: "",
  deliveryArea: "",
  discountType: "none",
  discountValue: "",
  discountReason: "",
  note: "",
  lines: [{ key: `${menuItemId}||`, menuItemId, name: "Vitest Dish", sizeName: null, options: [], quantity: qty }],
});
const hold = (cart: unknown, label = "Ali", cookie: string | null = owner) => call(heldRoute, { action: "hold", label, cart }, cookie);

beforeAll(async () => {
  const rs = [] as string[];
  for (const label of ["a", "b"]) {
    const r = await db
      .from("restaurants")
      .insert({ name: `${RUN_MARKER}-hmm-${label}`, ...(label === "a" ? { tax_rate_percent: 20, service_charge_percent: 10, service_charge_applies_to: "all", max_discount_percent: 50 } : {}) })
      .select("id")
      .single();
    if (r.error) throw r.error;
    rs.push(r.data.id);
  }
  [A, B] = rs;
  const mk = async (rid: string, name: string, price: number) => {
    const m = await db.from("menu_items").insert({ restaurant_id: rid, name, base_price: price }).select("id").single();
    if (m.error) throw m.error;
    return m.data.id as string;
  };
  dishId = await mk(A, "Vitest Dish", 10);
  sideId = await mk(A, "Vitest Side", 5);
  owner = await staffCookie(A, "owner");
  manager = await staffCookie(A, "manager");
  staff = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  await cleanupTestOrders();
  for (const rid of [A, B]) if (rid) await db.from("restaurants").delete().eq("id", rid);
});

describe("hold and resume", () => {
  it("needs a login; every role may hold; the list shows the held order", async () => {
    expect((await hold(cartOf(dishId), "x", null)).status).toBe(401);
    const h = await hold(cartOf(dishId, 2), "Ali", staff);
    expect(h.status).toBe(201);
    const list = await call(heldRoute, { action: "list" }, manager);
    expect(list.status).toBe(200);
    const row = list.json.held.find((x: any) => x.id === h.json.id);
    expect(row).toMatchObject({ label: "Ali", item_count: 2 });
    await call(heldRoute, { action: "delete", id: h.json.id });
  });

  it("resume with unchanged prices shows no difference, and a held cart can only be resumed once", async () => {
    const h = await hold(cartOf(dishId, 2));
    const r = await call(heldRoute, { action: "resume", id: h.json.id });
    expect(r.status).toBe(200);
    expect(r.json.price_changes).toEqual([]);
    expect(r.json.total_changed).toBe(false);
    expect(r.json.cart.lines).toHaveLength(1);
    expect((await call(heldRoute, { action: "resume", id: h.json.id })).status).toBe(404);
  });

  it("resume after a price change reports old and new price and total", async () => {
    const h = await hold(cartOf(dishId, 2));
    await db.from("menu_items").update({ base_price: 12 }).eq("id", dishId);
    try {
      const r = await call(heldRoute, { action: "resume", id: h.json.id });
      expect(r.status).toBe(200);
      expect(r.json.price_changes).toEqual([{ name: "Vitest Dish", old_unit_price: 10, new_unit_price: 12 }]);
      expect(r.json.total_changed).toBe(true);
      expect(r.json.new_total).toBeGreaterThan(r.json.old_total);
    } finally {
      await db.from("menu_items").update({ base_price: 10 }).eq("id", dishId);
    }
  });

  it("a held item that is no longer on the menu is removed and named; nothing left = 409", async () => {
    const gone = (await db.from("menu_items").insert({ restaurant_id: A, name: "Vitest Gone", base_price: 3 }).select("id").single()).data!.id as string;
    const cart = cartOf(dishId, 1);
    cart.lines.push({ key: `${gone}||`, menuItemId: gone, name: "Vitest Gone", sizeName: null, options: [], quantity: 1 });
    const h = await hold(cart);
    expect(h.status).toBe(201);
    await db.from("menu_items").update({ archived_at: new Date().toISOString() }).eq("id", gone);
    const r = await call(heldRoute, { action: "resume", id: h.json.id });
    expect(r.status).toBe(200);
    expect(r.json.removed.map((x: any) => x.name)).toEqual(["Vitest Gone"]);
    expect(r.json.cart.lines).toHaveLength(1);

    const only = await hold(cartOf(gone));
    expect(only.status).toBe(400); // cannot hold an item that is not available
  });

  it("another restaurant cannot list, resume or delete it; a foreign table session is dropped", async () => {
    const tb = await addTable(B);
    const sessionB = (await call(seatRoute, { table_id: tb.id, party_size: 2 }, ownerB)).json.session.id as string;
    const h = await hold(cartOf(dishId), "Mine", owner);
    expect((await call(heldRoute, { action: "list" }, ownerB)).json.held.some((x: any) => x.id === h.json.id)).toBe(false);
    expect((await call(heldRoute, { action: "resume", id: h.json.id }, ownerB)).status).toBe(404);
    expect((await call(heldRoute, { action: "delete", id: h.json.id }, ownerB)).status).toBe(404);
    expect((await db.from("held_carts").select("id").eq("id", h.json.id)).data).toHaveLength(1);

    // A cart that names ANOTHER restaurant's table session does not remember it.
    const sneaky = await hold(cartOf(dishId, 1, { tableId: tb.id, tableNumber: tb.table_number, sessionId: sessionB }), "Sneaky");
    expect(sneaky.status).toBe(201);
    const back = await call(heldRoute, { action: "resume", id: sneaky.json.id });
    expect(back.json.cart.table).toBeNull();
    await call(heldRoute, { action: "delete", id: h.json.id });
  });

  it("price keys sent by the browser are ignored", async () => {
    const cart: any = cartOf(dishId, 1);
    cart.lines[0].unitPrice = 0.01;
    cart.total = 0.01;
    const h = await hold(cart);
    expect(h.status).toBe(201);
    const stored = (await db.from("held_carts").select("cart").eq("id", h.json.id).single()).data as any;
    expect(JSON.stringify(stored.cart)).not.toContain("0.01");
    expect(stored.cart.quote.total).toBeGreaterThan(10);
    await call(heldRoute, { action: "delete", id: h.json.id });
  });
});

describe("move table", () => {
  it("any role moves a party; the order keeps its number; the old table is free; the move is logged", async () => {
    const t1 = await addTable(A);
    const t2 = await addTable(A);
    const session = await seatAt(t1.id);
    const orderId = await orderOn(session, [{ id: dishId, qty: 1 }]);
    const before = await orderRow(orderId);

    const r = await call(moveRoute, { table_session_id: session, to_table_id: t2.id }, staff);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ from_table: t1.table_number, to_table: t2.table_number, seats_warning: false });
    expect((await sessionRow(session)).table_id).toBe(t2.id);
    expect((await orderRow(orderId)).order_number).toBe(before.order_number);
    expect((await orderRow(orderId)).table_session_id).toBe(session);
    // The old table can be seated again at once.
    expect(await seatAt(t1.id)).toBeTruthy();
    const ev = (await events(orderId)).find((e) => e.event === "table_moved");
    expect(ev.detail).toMatchObject({ from_table: t1.table_number, to_table: t2.table_number });
    expect(ev.staff_id).toBeTruthy();
  });

  it("an occupied table is refused (409) and nothing changes; two moves to one table: only one wins", async () => {
    const [t1, t2, t3] = [await addTable(A), await addTable(A), await addTable(A)];
    const s1 = await seatAt(t1.id);
    const s2 = await seatAt(t2.id);
    const busy = await call(moveRoute, { table_session_id: s1, to_table_id: t2.id });
    expect(busy.status).toBe(409);
    expect((await sessionRow(s1)).table_id).toBe(t1.id);
    const [x, y] = await Promise.all([
      call(moveRoute, { table_session_id: s1, to_table_id: t3.id }),
      call(moveRoute, { table_session_id: s2, to_table_id: t3.id }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const open = (await db.from("table_sessions").select("id").eq("table_id", t3.id).is("cleared_at", null)).data;
    expect(open).toHaveLength(1);
  });

  it("a smaller table only warns; same table, cleared session, other restaurant's table or session are refused", async () => {
    const big = await addTable(A, 6);
    const small = await addTable(A, 1);
    const session = await seatAt(big.id, 3);
    const w = await call(moveRoute, { table_session_id: session, to_table_id: small.id });
    expect(w.status).toBe(200);
    expect(w.json).toMatchObject({ seats_warning: true, seats: 1, party_size: 3 });
    expect((await call(moveRoute, { table_session_id: session, to_table_id: small.id })).status).toBe(409); // same table

    const foreignTable = await addTable(B);
    expect((await call(moveRoute, { table_session_id: session, to_table_id: foreignTable.id })).status).toBe(404);
    expect((await sessionRow(session)).table_id).toBe(small.id);
    // Another restaurant's owner cannot move this restaurant's party.
    const mine = await addTable(B);
    expect((await call(moveRoute, { table_session_id: session, to_table_id: mine.id }, ownerB)).status).toBe(404);
    // A cleared session cannot be moved.
    await db.from("table_sessions").update({ cleared_at: new Date().toISOString() }).eq("id", session);
    expect((await call(moveRoute, { table_session_id: session, to_table_id: big.id })).status).toBe(404);
    expect((await call(moveRoute, { table_session_id: session, to_table_id: big.id }, null)).status).toBe(401);
  });

  it("an inactive table cannot be a destination", async () => {
    const t1 = await addTable(A);
    const off = await addTable(A);
    await db.from("restaurant_tables").update({ is_active: false }).eq("id", off.id);
    const session = await seatAt(t1.id);
    expect((await call(moveRoute, { table_session_id: session, to_table_id: off.id })).status).toBe(404);
  });
});

describe("merge orders", () => {
  async function pair() {
    const [t1, t2] = [await addTable(A), await addTable(A)];
    const s1 = await seatAt(t1.id);
    const s2 = await seatAt(t2.id);
    const target = await orderOn(s1, [{ id: dishId, qty: 2 }], { discount: { type: "percent", value: 10, reason: "vitest" } }); // 20.00
    const source = await orderOn(s2, [{ id: dishId, qty: 1 }, { id: sideId, qty: 1 }]); // 15.00
    return { t1, t2, s1, s2, target, source };
  }

  it("staff may not merge (403); no login 401; manager and owner may", async () => {
    const p = await pair();
    const body = { source_order_id: p.source, target_order_id: p.target };
    expect((await call(mergeRoute, body, null)).status).toBe(401);
    expect((await call(mergeRoute, body, staff)).status).toBe(403);
    expect((await orderRow(p.source)).status).not.toBe("merged");
    expect((await call(mergeRoute, body, manager)).status).toBe(200);
    const q = await pair();
    expect((await call(mergeRoute, { source_order_id: q.source, target_order_id: q.target }, owner)).status).toBe(200);
  });

  it("the new total is computeBill over all items; the source becomes merged and its table is freed; both are logged", async () => {
    const p = await pair();
    const targetBefore = await orderRow(p.target);
    const r = await call(mergeRoute, { source_order_id: p.source, target_order_id: p.target });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ target_order_id: p.target, items_moved: 2, source_table_cleared: true });

    const expected = computeBill(3500, "dine_in", await settings(), { type: "percent", value: 10, reason: "vitest" });
    if (!expected.ok) throw new Error(expected.error);
    const t = await orderRow(p.target);
    expect(Math.round(Number(t.total) * 100)).toBe(expected.bill.totalPence);
    expect(Math.round(Number(t.subtotal) * 100)).toBe(3500);
    expect(Math.round(Number(t.discount_amount) * 100)).toBe(expected.bill.discountPence);
    expect(Math.round(Number(t.tax_amount) * 100)).toBe(expected.bill.taxPence);
    expect(Number(t.total)).toBeGreaterThan(Number(targetBefore.total));
    expect(t.order_number).toBe(targetBefore.order_number);
    const items = (await db.from("order_items").select("line_total").eq("order_id", p.target)).data!;
    expect(items).toHaveLength(3);
    expect(items.reduce((n, i) => n + Math.round(Number(i.line_total) * 100), 0)).toBe(3500);

    const s = await orderRow(p.source);
    expect(s.status).toBe("merged");
    expect(Number(s.total)).toBe(0);
    expect((await db.from("order_items").select("id").eq("order_id", p.source)).data).toHaveLength(0);
    expect((await sessionRow(p.s2)).cleared_at).not.toBeNull(); // source table free
    expect((await sessionRow(p.s1)).cleared_at).toBeNull(); // target table still seated

    const [te, se] = [await events(p.target), await events(p.source)];
    expect(te.find((e) => e.event === "merged_in").detail).toMatchObject({ source_order_number: s.order_number, items_moved: 2 });
    expect(se.find((e) => e.event === "merged_into").detail).toMatchObject({ target_order_number: t.order_number });
  });

  it("an order with a payment cannot be merged (either side); cancelled, merged, other-restaurant and same order are refused", async () => {
    const p = await pair();
    const pay = await call(payRoute, { order_id: p.source, method: "cash", amount: 1, idempotency_key: `vitest-pay-${Math.random().toString(36).slice(2)}` });
    expect(pay.status).toBe(201);
    const body = { source_order_id: p.source, target_order_id: p.target };
    expect((await call(mergeRoute, body)).status).toBe(409);
    expect((await call(mergeRoute, { source_order_id: p.target, target_order_id: p.source })).status).toBe(409);
    expect((await orderRow(p.target)).status).not.toBe("merged");
    expect((await db.from("order_items").select("id").eq("order_id", p.source)).data).toHaveLength(2);

    const c = await pair();
    await db.from("orders").update({ status: "cancelled" }).eq("id", c.source);
    expect((await call(mergeRoute, { source_order_id: c.source, target_order_id: c.target })).status).toBe(409);
    expect((await call(mergeRoute, { source_order_id: c.target, target_order_id: c.source })).status).toBe(409);

    const m = await pair();
    expect((await call(mergeRoute, { source_order_id: m.source, target_order_id: m.target })).status).toBe(200);
    const again = await call(mergeRoute, { source_order_id: m.source, target_order_id: m.target });
    expect(again.status).toBe(409);
    expect((await call(mergeRoute, { source_order_id: m.target, target_order_id: m.source })).status).toBe(409);
    // A merged order takes no payment.
    expect((await call(payRoute, { order_id: m.source, method: "cash", amount: 1, idempotency_key: `vitest-pay-${Math.random().toString(36).slice(2)}` })).status).toBe(409);

    const o = await pair();
    expect((await call(mergeRoute, { source_order_id: o.source, target_order_id: o.target }, ownerB)).status).toBe(404);
    expect((await call(mergeRoute, { source_order_id: o.source, target_order_id: o.source })).status).toBe(400);
    expect((await orderRow(o.source)).status).not.toBe("merged");
  });

  it("a takeaway order (no table) cannot be merged", async () => {
    const p = await pair();
    const take = await call(orderRoute, { order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: dishId, quantity: 1 }] });
    expect(take.status).toBe(201);
    expect((await call(mergeRoute, { source_order_id: take.json.order_id, target_order_id: p.target })).status).toBe(409);
  });

  it("two merges of the same source at once: exactly one wins and the total stays right", async () => {
    const p = await pair();
    const t3 = await addTable(A);
    const s3 = await seatAt(t3.id);
    const other = await orderOn(s3, [{ id: dishId, qty: 1 }]);
    const [x, y] = await Promise.all([
      call(mergeRoute, { source_order_id: p.source, target_order_id: p.target }),
      call(mergeRoute, { source_order_id: p.source, target_order_id: other }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const winner = x.status === 200 ? p.target : other;
    const items = (await db.from("order_items").select("line_total").eq("order_id", winner)).data!;
    const subtotal = items.reduce((n, i) => n + Math.round(Number(i.line_total) * 100), 0);
    expect(Math.round(Number((await orderRow(winner)).subtotal) * 100)).toBe(subtotal);
    expect((await db.from("order_items").select("id").eq("order_id", p.source)).data).toHaveLength(0);
  });

  it("a merged order is not counted in sales, profit, the tables bill or the orders board", async () => {
    const p = await pair();
    expect(orderSalesPence({ status: "merged", total: 15, tax_amount: 2 })).toBe(0);
    await call(mergeRoute, { source_order_id: p.source, target_order_id: p.target });

    const source = await orderRow(p.source);
    expect(source.status).toBe("merged");
    const target = await orderRow(p.target);
    const statsRows = [source, target].map((o) => ({ ...o, status: o.status }));
    const totals = totalsFor(statsRows as any, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    expect(totals.orders).toBe(1); // only the target counts
    expect(totals.salesPence).toBe(Math.round(Number(target.total) * 100) - Math.round(Number(target.tax_amount) * 100));

    const floor = await loadFloor(A);
    const tTable = floor.tables.find((t) => t.session?.id === p.s1)!;
    expect(tTable.session!.bill).toBe(Number(target.total));
    expect(tTable.session!.orders.map((o) => o.id)).toEqual([p.target]);
    expect(floor.tables.find((t) => t.id === p.t2.id)!.state).not.toBe("seated");

    const board = await loadBoardOrders(A, "owner");
    expect(board.some((o) => o.id === p.source)).toBe(false);
    expect(board.some((o) => o.id === p.target)).toBe(true);
  });

  it("cost snapshots follow the items to the target; no cost or profit leaks to manager or staff", async () => {
    const costed = (await db.from("menu_items").insert({ restaurant_id: A, name: "Vitest Costed", base_price: 8 }).select("id").single()).data!.id as string;
    await db.from("menu_costs").insert({ restaurant_id: A, menu_item_id: costed, cost_price: 3 });
    const p = await pair();
    const s3 = await addTable(A).then((t) => seatAt(t.id));
    const costedOrder = await orderOn(s3, [{ id: costed, qty: 2 }]); // cost 6.00
    const tgtBefore = await orderRow(p.target);
    const r = await call(mergeRoute, { source_order_id: costedOrder, target_order_id: p.target }, manager);
    expect(r.status).toBe(200);
    const t = await orderRow(p.target);
    expect(Number(t.cost_total)).toBeCloseTo(Number(tgtBefore.cost_total ?? 0) + 6, 2);
    // Responses and events carry no cost or profit words.
    expect(JSON.stringify(r.json)).not.toMatch(NO_COST_KEYS);
    for (const e of await events(p.target)) expect(JSON.stringify(e)).not.toMatch(NO_COST_KEYS);
    const managerBoard = JSON.stringify(await loadBoardOrders(A, "manager"));
    expect(managerBoard).not.toMatch(NO_COST_KEYS);
    expect(JSON.stringify(await loadBoardOrders(A, "staff"))).not.toMatch(NO_COST_KEYS);
    const floor = JSON.stringify(await loadFloor(A));
    expect(floor).not.toMatch(NO_COST_KEYS);
  });
});
