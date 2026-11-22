import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as clearRoute } from "@/app/api/staff/clear-table/route";
import { POST as seatRoute } from "@/app/api/staff/seat-table/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as payRoute } from "@/app/api/staff/record-payment/route";
import { loadBoardOrders } from "@/lib/orders-board";
import { RUN_MARKER, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// "Clear anyway": the party left without paying. Owner/manager only; the unpaid order
// stays on the Orders board and gets a 'cleared_unpaid' row in order_events.
// Only throwaway "vitest-run-" restaurants. Needs migration 0027 (order_events).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;
let dishId: string; // 10.00
let counter = 0;

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const payKey = () => `vitest-pay-${Math.random().toString(36).slice(2)}`;

/** A seated table with one unpaid dine-in order of 10.00 (no tax or service charge on these restaurants). */
async function unpaidTable() {
  const t = await db.from("restaurant_tables").insert({ restaurant_id: A, table_number: `CA${++counter}`, seats: 4 }).select("id").single();
  if (t.error) throw t.error;
  const seat = await call(seatRoute, { table_id: t.data.id, party_size: 2 });
  expect(seat.status).toBe(201);
  const sessionId = seat.json.session.id as string;
  const o = await call(orderRoute, { order_type: "dine_in", table_session_id: sessionId, notes: RUN_MARKER, items: [{ menu_item_id: dishId, quantity: 1 }] });
  expect(o.status).toBe(201);
  return { sessionId, orderId: o.json.order_id as string };
}
const events = async (orderId: string) => ((await db.from("order_events").select("*").eq("order_id", orderId)).data ?? []) as any[];
const sessionRow = async (id: string) => (await db.from("table_sessions").select("*").eq("id", id).single()).data as any;

beforeAll(async () => {
  const rs = [] as string[];
  for (const label of ["a", "b"]) {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-ca-${label}` }).select("id").single();
    if (r.error) throw r.error;
    rs.push(r.data.id);
  }
  [A, B] = rs;
  const m = await db.from("menu_items").insert({ restaurant_id: A, name: "Vitest Dish", base_price: 10 }).select("id").single();
  if (m.error) throw m.error;
  dishId = m.data.id as string;
  owner = await staffCookie(A, "owner");
  manager = await staffCookie(A, "manager");
  staff = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  await cleanupTestOrders();
  for (const rid of [A, B]) if (rid) await db.from("restaurants").delete().eq("id", rid);
});

describe("Clear anyway on an unpaid bill", () => {
  it("staff gets 403 and the table stays open, with no event", async () => {
    const t = await unpaidTable();
    const r = await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, staff);
    expect(r.status).toBe(403);
    expect((await sessionRow(t.sessionId)).cleared_at).toBeNull();
    expect(await events(t.orderId)).toHaveLength(0);
  });

  it("needs a login", async () => {
    const t = await unpaidTable();
    expect((await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, null)).status).toBe(401);
  });

  it("owner clears it: table freed, event written with who, which order and how much", async () => {
    const t = await unpaidTable();
    const r = await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, owner);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, unpaid_orders: 1, unpaid_total: 10 });
    expect((await sessionRow(t.sessionId)).cleared_at).not.toBeNull();
    const ev = await events(t.orderId);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event: "cleared_unpaid", restaurant_id: A });
    expect(ev[0].staff_id).toBeTruthy();
    expect(ev[0].detail).toMatchObject({ owed: 10, total: 10, table_session_id: t.sessionId });
  });

  it("manager may clear too, and a part-paid order records only what is left", async () => {
    const t = await unpaidTable();
    const pay = await call(payRoute, { order_id: t.orderId, method: "cash", amount: 4, idempotency_key: payKey() });
    expect(pay.status).toBe(201);
    const r = await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, manager);
    expect(r.status).toBe(200);
    expect(r.json.unpaid_total).toBe(6);
    expect((await events(t.orderId))[0].detail.owed).toBe(6);
  });

  it("the unpaid order stays on the Orders board, still unpaid", async () => {
    const t = await unpaidTable();
    expect((await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true })).status).toBe(200);
    const row = (await loadBoardOrders(A, "owner")).find((o) => o.id === t.orderId);
    expect(row).toBeTruthy();
    expect(row!.payment_status).not.toBe("paid");
    expect(row!.status).not.toBe("cancelled");
  });

  it("another restaurant's session is 404 and gets no event", async () => {
    const t = await unpaidTable();
    expect((await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true }, ownerB)).status).toBe(404);
    expect(await events(t.orderId)).toHaveLength(0);
  });

  it("clearing twice: the second is 409 and does not write a second event", async () => {
    const t = await unpaidTable();
    expect((await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true })).status).toBe(200);
    expect((await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true })).status).toBe(409);
    expect(await events(t.orderId)).toHaveLength(1);
  });
});

describe("plain Clear table after payment is unchanged", () => {
  it("a paid bill clears for staff and owner, with no cleared_unpaid event", async () => {
    for (const cookie of [staff, owner]) {
      const t = await unpaidTable();
      const pay = await call(payRoute, { order_id: t.orderId, method: "cash", amount: 10, idempotency_key: payKey() });
      expect(pay.status).toBe(201);
      const r = await call(clearRoute, { table_session_id: t.sessionId }, cookie);
      expect(r.status).toBe(200);
      expect(r.json.unpaid_orders).toBeUndefined();
      expect((await sessionRow(t.sessionId)).cleared_at).not.toBeNull();
      expect(await events(t.orderId)).toHaveLength(0);
    }
  });

  it("clear_unpaid on a fully paid bill clears but records nothing", async () => {
    const t = await unpaidTable();
    await call(payRoute, { order_id: t.orderId, method: "cash", amount: 10, idempotency_key: payKey() });
    const r = await call(clearRoute, { table_session_id: t.sessionId, clear_unpaid: true });
    expect(r.status).toBe(200);
    expect(r.json.unpaid_orders).toBe(0);
    expect(await events(t.orderId)).toHaveLength(0);
  });
});
