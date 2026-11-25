import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as cancelRoute } from "@/app/api/staff/cancel-order/route";
import { POST as refundRoute } from "@/app/api/staff/refund/route";
import { POST as voidRoute } from "@/app/api/staff/void-item/route";
import { POST as addRoute } from "@/app/api/staff/add-items/route";
import { POST as seatRoute } from "@/app/api/staff/seat-table/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as payRoute } from "@/app/api/staff/record-payment/route";
import { POST as statusRoute } from "@/app/api/staff/update-order-status/route";
import { BILL_SETTINGS_SELECT, computeBill, pence, type BillSettingsRow, type OrderKind } from "@/lib/order-pricing";
import { loadBoardOrders } from "@/lib/orders-board";
import { loadPrintData } from "@/lib/receipt-data";
import { buildKot, buildReceipt } from "@/lib/receipt";
import { loadProfitSummary } from "@/lib/profit-data";
import { RUN_MARKER, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// B4b: cancel an order, void an item, refund a payment. Only throwaway "vitest-run-"
// restaurants. Needs migration 0029 (cancel_order_tx, record_refund_tx, void_order_item_tx).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;
let dishId: string; // 10.00, cost 4.00
let sideId: string; // 3.50
let counter = 0;
let settings: BillSettingsRow;

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const key = () => `vitest-key-${Math.random().toString(36).slice(2)}`;
const REASON = "Customer changed mind";

/** A takeaway order (default 1 x dish + 1 x side = 13.50 + tax). */
async function takeaway(items = [{ menu_item_id: dishId, quantity: 1 }, { menu_item_id: sideId, quantity: 1 }], extra: Record<string, unknown> = {}) {
  const o = await call(orderRoute, { order_type: "takeaway", notes: RUN_MARKER, items, ...extra }, staff);
  expect(o.status).toBe(201);
  return o.json.order_id as string;
}
async function paidOrder() {
  const id = await takeaway();
  const total = Number((await orderRow(id)).total);
  const p = await call(payRoute, { order_id: id, method: "card", amount: total, idempotency_key: key() }, staff);
  expect(p.status).toBe(201);
  return { id, total };
}
const orderRow = async (id: string) => (await db.from("orders").select("*").eq("id", id).single()).data as any;
const itemRows = async (id: string) => ((await db.from("order_items").select("*").eq("order_id", id).order("created_at")).data ?? []) as any[];
const payRows = async (id: string) => ((await db.from("order_payments").select("*").eq("order_id", id).order("created_at")).data ?? []) as any[];
const events = async (orderId: string, event?: string) => {
  let q = db.from("order_events").select("*").eq("order_id", orderId);
  if (event) q = q.eq("event", event);
  return ((await q).data ?? []) as any[];
};
const bill = (subtotalPence: number, kind: OrderKind = "takeaway", discount?: { type: "percent" | "fixed"; value: number; reason: string | null }) => {
  const b = computeBill(subtotalPence, kind, settings, discount ?? null);
  if (!b.ok) throw new Error(b.error);
  return b.bill;
};

beforeAll(async () => {
  const rs = [] as string[];
  for (const label of ["a", "b"]) {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-cvr-${label}`, tax_rate_percent: 20, max_discount_percent: 50 }).select("id").single();
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

describe("cancel order", () => {
  it("needs a login and a reason", async () => {
    const id = await takeaway();
    expect((await call(cancelRoute, { order_id: id, reason: REASON }, null)).status).toBe(401);
    expect((await call(cancelRoute, { order_id: id }, staff)).status).toBe(400);
    expect((await call(cancelRoute, { order_id: id, reason: "  " }, staff)).status).toBe(400);
    expect((await orderRow(id)).status).toBe("new");
  });

  it("staff may cancel a new unpaid order; reason, who and when are saved, with an order_events row", async () => {
    const id = await takeaway();
    const r = await call(cancelRoute, { order_id: id, reason: "Duplicate order" }, staff);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, duplicate: false, status: "cancelled", refunded: 0 });
    const o = await orderRow(id);
    expect(o.status).toBe("cancelled");
    expect(o.cancel_reason).toBe("Duplicate order");
    expect(o.cancelled_by).toBeTruthy();
    expect(o.cancelled_at).toBeTruthy();
    const ev = await events(id, "cancelled");
    expect(ev).toHaveLength(1);
    expect(ev[0].staff_id).toBe(o.cancelled_by);
    expect(ev[0].detail).toMatchObject({ reason: "Duplicate order", status_before: "new", refunded: 0 });
  });

  it("a double click cancels once (second answer is duplicate, one event)", async () => {
    const id = await takeaway();
    const [a, b] = await Promise.all([
      call(cancelRoute, { order_id: id, reason: REASON }, staff),
      call(cancelRoute, { order_id: id, reason: REASON }, staff),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json.duplicate, b.json.duplicate].sort()).toEqual([false, true]);
    expect(await events(id, "cancelled")).toHaveLength(1);
  });

  it("staff cannot cancel an order in the kitchen (403); a manager can", async () => {
    const id = await takeaway();
    expect((await call(statusRoute, { order_id: id, status: "preparing" }, staff)).status).toBe(200);
    expect((await call(cancelRoute, { order_id: id, reason: REASON }, staff)).status).toBe(403);
    expect((await orderRow(id)).status).toBe("preparing");
    const r = await call(cancelRoute, { order_id: id, reason: REASON }, manager);
    expect(r.status).toBe(200);
    expect((await orderRow(id)).status).toBe("cancelled");
  });

  it("accepted and ready orders also need a manager", async () => {
    for (const status of ["accepted", "ready"]) {
      const id = await takeaway();
      await db.from("orders").update({ status }).eq("id", id);
      expect((await call(cancelRoute, { order_id: id, reason: REASON }, staff)).status).toBe(403);
      expect((await call(cancelRoute, { order_id: id, reason: REASON }, owner)).status).toBe(200);
    }
  });

  it("a completed order is never cancelled (409, refund it instead)", async () => {
    const id = await takeaway();
    await db.from("orders").update({ status: "completed" }).eq("id", id);
    expect((await call(cancelRoute, { order_id: id, reason: REASON }, owner)).status).toBe(409);
    expect((await orderRow(id)).status).toBe("completed");
  });

  it("a cancelled order cannot be reopened, paid or added to", async () => {
    const t = await db.from("restaurant_tables").insert({ restaurant_id: A, table_number: `CV${++counter}`, seats: 4 }).select("id").single();
    const seat = await call(seatRoute, { table_id: t.data!.id, party_size: 2 });
    const o = await call(orderRoute, { order_type: "dine_in", table_session_id: seat.json.session.id, notes: RUN_MARKER, items: [{ menu_item_id: dishId, quantity: 1 }] });
    const id = o.json.order_id as string;
    expect((await call(cancelRoute, { order_id: id, reason: REASON }, staff)).status).toBe(200);
    for (const status of ["new", "preparing", "ready", "completed"]) {
      expect((await call(statusRoute, { order_id: id, status }, owner)).status).toBe(409);
    }
    expect((await call(payRoute, { order_id: id, method: "cash", amount: 1, idempotency_key: key() }, owner)).status).toBe(409);
    expect((await call(addRoute, { order_id: id, items: [{ menu_item_id: sideId, quantity: 1 }] }, owner)).status).toBe(409);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, owner)).status).toBe(409);
    const row = await orderRow(id);
    expect(row.status).toBe("cancelled");
    expect(Number(row.paid_amount)).toBe(0);
    expect(await payRows(id)).toHaveLength(0);
  });

  it("a paid order: cancel without a refund method is refused; staff may not cancel it at all", async () => {
    const { id, total } = await paidOrder();
    const r = await call(cancelRoute, { order_id: id, reason: REASON }, manager);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ refund_required: true, paid_amount: total });
    expect((await call(cancelRoute, { order_id: id, reason: REASON, refund_method: "cash", idempotency_key: key() }, staff)).status).toBe(403);
    // a 'new' paid order needs a manager even without the refund flag
    expect((await call(cancelRoute, { order_id: id, reason: REASON }, staff)).status).toBe(403);
    const row = await orderRow(id);
    expect(row.status).toBe("new");
    expect(Number(row.paid_amount)).toBe(total);
  });

  it("Cancel and refund: one step cancels AND refunds all of it (audit rows for both)", async () => {
    const { id, total } = await paidOrder();
    const r = await call(cancelRoute, { order_id: id, reason: "Wrong order", refund_method: "cash", idempotency_key: key() }, manager);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "cancelled", payment_status: "refunded", refunded: total });
    const row = await orderRow(id);
    expect(row.status).toBe("cancelled");
    expect(row.payment_status).toBe("refunded");
    expect(Number(row.paid_amount)).toBe(0);
    expect(Number(row.refunded_amount)).toBe(total);
    const refunds = (await payRows(id)).filter((p) => p.kind === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ method: "cash", refund_reason: "Wrong order" });
    expect(Number(refunds[0].amount)).toBe(total);
    expect((await events(id, "refunded"))[0].detail).toMatchObject({ with_cancel: true, method: "cash" });
    expect(await events(id, "cancelled")).toHaveLength(1);
  });

  it("Cancel and refund is atomic: a failing refund rolls the cancel back too", async () => {
    const { id, total } = await paidOrder();
    // A method the order_payments check refuses: the refund insert fails AFTER the order row was updated.
    const { error } = await db.rpc("cancel_order_tx", {
      p_restaurant_id: A,
      p_staff_id: null,
      p_order_id: id,
      p_reason: REASON,
      p_can_cancel_any: true,
      p_refund_method: "bitcoin",
      p_idempotency_key: key(),
    });
    expect(error).toBeTruthy();
    const row = await orderRow(id);
    expect(row.status).toBe("new");
    expect(row.cancel_reason).toBeNull();
    expect(Number(row.paid_amount)).toBe(total);
    expect(row.payment_status).toBe("paid");
    expect((await payRows(id)).filter((p) => p.kind === "refund")).toHaveLength(0);
    expect(await events(id)).toHaveLength(0);
  });

  it("a part-paid order is cancelled with a refund of exactly what was taken", async () => {
    const id = await takeaway();
    expect((await call(payRoute, { order_id: id, method: "cash", amount: 5, idempotency_key: key() }, staff)).status).toBe(201);
    const r = await call(cancelRoute, { order_id: id, reason: REASON, refund_method: "cash", idempotency_key: key() }, owner);
    expect(r.status).toBe(200);
    expect(r.json.refunded).toBe(5);
    const row = await orderRow(id);
    expect(Number(row.refunded_amount)).toBe(5);
    expect(Number(row.paid_amount)).toBe(0);
  });
});

describe("refund", () => {
  it("staff get 403; manager can refund part, then the rest", async () => {
    const { id, total } = await paidOrder();
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, staff)).status).toBe(403);
    const a = await call(refundRoute, { order_id: id, method: "cash", amount: 3, reason: "Wrong item", idempotency_key: key() }, manager);
    expect(a.status).toBe(201);
    expect(a.json).toMatchObject({ payment_status: "partially_refunded", paid_amount: (pence(total) - 300) / 100, refunded_amount: 3 });
    const rest = (pence(total) - 300) / 100;
    const b = await call(refundRoute, { order_id: id, method: "card", amount: rest, reason: "Overcharged", idempotency_key: key() }, owner);
    expect(b.status).toBe(201);
    expect(b.json).toMatchObject({ payment_status: "refunded", paid_amount: 0, refunded_amount: total });
    expect((await events(id, "refunded")).map((e) => e.detail.reason).sort()).toEqual(["Overcharged", "Wrong item"]);
  });

  it("needs a reason, a known method and a positive whole-pence amount", async () => {
    const { id } = await paidOrder();
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, idempotency_key: key() }, owner)).status).toBe(400);
    expect((await call(refundRoute, { order_id: id, method: "bitcoin", amount: 1, reason: REASON, idempotency_key: key() }, owner)).status).toBe(400);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 0, reason: REASON, idempotency_key: key() }, owner)).status).toBe(400);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1.005, reason: REASON, idempotency_key: key() }, owner)).status).toBe(400);
    expect((await payRows(id)).filter((p) => p.kind === "refund")).toHaveLength(0);
  });

  it("refuses more than the net paid amount (also after an earlier refund)", async () => {
    const { id, total } = await paidOrder();
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: total + 0.01, reason: REASON, idempotency_key: key() }, owner)).status).toBe(400);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 5, reason: REASON, idempotency_key: key() }, owner)).status).toBe(201);
    const left = (pence(total) - 500) / 100;
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: left + 0.01, reason: REASON, idempotency_key: key() }, owner)).status).toBe(400);
    expect(Number((await orderRow(id)).refunded_amount)).toBe(5);
  });

  it("the same idempotency key refunds once; same key with another amount is a 409", async () => {
    const { id } = await paidOrder();
    const k = key();
    const body = { order_id: id, method: "cash", amount: 2, reason: REASON, idempotency_key: k };
    const results = await Promise.all([call(refundRoute, body, owner), call(refundRoute, body, owner), call(refundRoute, body, manager)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect((await payRows(id)).filter((p) => p.kind === "refund")).toHaveLength(1);
    expect(Number((await orderRow(id)).refunded_amount)).toBe(2);
    expect((await call(refundRoute, { ...body, amount: 3 }, owner)).status).toBe(409);
    expect((await call(refundRoute, { ...body, method: "card" }, owner)).status).toBe(409);
    expect(Number((await orderRow(id)).refunded_amount)).toBe(2);
  });

  it("a payment key cannot be reused as a refund key (and the other way round)", async () => {
    const id = await takeaway();
    const total = Number((await orderRow(id)).total);
    const k = key();
    expect((await call(payRoute, { order_id: id, method: "cash", amount: total, idempotency_key: k }, staff)).status).toBe(201);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: k }, owner)).status).toBe(409);
    const k2 = key();
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: k2 }, owner)).status).toBe(201);
    expect((await call(payRoute, { order_id: id, method: "cash", amount: 1, idempotency_key: k2 }, staff)).status).toBe(409);
  });

  it("two refunds at the same moment can never add up to more than was paid", async () => {
    const { id, total } = await paidOrder();
    const big = Math.round(pence(total) * 0.7) / 100; // 70% each: only one can fit
    const results = await Promise.all(
      [0, 1, 2, 3].map(() => call(refundRoute, { order_id: id, method: "cash", amount: big, reason: REASON, idempotency_key: key() }, owner)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    const row = await orderRow(id);
    expect(Number(row.refunded_amount)).toBe(big);
    const sum = (await payRows(id)).filter((p) => p.kind === "refund").reduce((n, p) => n + pence(p.amount), 0);
    expect(sum).toBe(pence(big));
    expect(pence(row.paid_amount) + pence(row.refunded_amount)).toBe(pence(total));
  });

  it("nothing paid -> 409; part paid -> 409 (take the rest or cancel); after a refund no new payment", async () => {
    const unpaid = await takeaway();
    expect((await call(refundRoute, { order_id: unpaid, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, owner)).status).toBe(409);
    const part = await takeaway();
    await call(payRoute, { order_id: part, method: "cash", amount: 5, idempotency_key: key() }, staff);
    const r = await call(refundRoute, { order_id: part, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, owner);
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/part paid/);
    const { id } = await paidOrder();
    await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, owner);
    expect((await call(payRoute, { order_id: id, method: "cash", amount: 1, idempotency_key: key() }, staff)).status).toBe(409);
  });

  it("a cash refund is stored as kind 'refund' + method 'cash' with the staff member (the cash drawer hook)", async () => {
    const { id } = await paidOrder();
    await call(refundRoute, { order_id: id, method: "cash", amount: 2, reason: REASON, idempotency_key: key() }, manager);
    const rows = await payRows(id);
    expect(rows.map((p) => p.kind)).toEqual(["payment", "refund"]);
    expect(rows[1]).toMatchObject({ method: "cash", refund_reason: REASON });
    expect(rows[1].staff_id).toBeTruthy();
  });

  it("the bill shows the refund as a minus line and nothing owed", async () => {
    const { id } = await paidOrder();
    await call(refundRoute, { order_id: id, method: "cash", amount: 2, reason: REASON, idempotency_key: key() }, owner);
    const data = await loadPrintData(id, A);
    const r = buildReceipt(data!);
    expect(r.payments.map((p) => p.label)).toEqual(["Card", "Refund (Cash)"]);
    expect(r.payments[1].amount.startsWith("-")).toBe(true);
    expect(r.paymentStatus).toBe("partially_refunded");
    expect(pence(r.balanceDue.replace(/[^0-9.]/g, ""))).toBe(0);
  });
});

describe("void item", () => {
  it("staff get 403; a reason is required", async () => {
    const id = await takeaway();
    const items = await itemRows(id);
    expect((await call(voidRoute, { order_id: id, item_id: items[1].id, reason: REASON }, staff)).status).toBe(403);
    expect((await call(voidRoute, { order_id: id, item_id: items[1].id }, manager)).status).toBe(400);
    expect((await itemRows(id)).every((i) => !i.voided_at)).toBe(true);
  });

  it("voids one line: the server works out the new total with computeBill, cost follows, event saved", async () => {
    const id = await takeaway([{ menu_item_id: dishId, quantity: 2 }, { menu_item_id: sideId, quantity: 1 }]);
    const items = await itemRows(id);
    const dish = items.find((i) => i.menu_item_id === dishId);
    const r = await call(voidRoute, { order_id: id, item_id: dish.id, reason: "Wrong item entered", total: 0.01 }, manager);
    expect(r.status).toBe(200);
    const expected = bill(350);
    expect(r.json.total).toBe(expected.totalPence / 100);
    const row = await orderRow(id);
    expect(Number(row.subtotal)).toBe(3.5);
    expect(pence(row.total)).toBe(expected.totalPence);
    expect(pence(row.tax_amount)).toBe(expected.taxPence);
    expect(Number(row.cost_total)).toBe(0); // only the dish had a cost
    const voided = (await itemRows(id)).find((i) => i.id === dish.id);
    expect(voided.voided_at).toBeTruthy();
    expect(voided.void_reason).toBe("Wrong item entered");
    expect(voided.voided_by).toBeTruthy();
    const ev = (await events(id, "item_voided"))[0];
    expect(ev.detail).toMatchObject({ item_id: dish.id, reason: "Wrong item entered", quantity: 2 });
    expect(JSON.stringify(ev.detail)).not.toMatch(/cost|profit/i);
  });

  it("a fixed discount bigger than the new cap is clamped inside it", async () => {
    const d = { type: "fixed" as const, value: 6, reason: "vitest" }; // 13.50 cap 6.75: fine
    const id = await takeaway(undefined, { discount: d });
    const items = await itemRows(id);
    const dish = items.find((i) => i.menu_item_id === dishId);
    const r = await call(voidRoute, { order_id: id, item_id: dish.id, reason: REASON }, owner);
    expect(r.status).toBe(200);
    expect(r.json.discount_clamped).toBe(true);
    const row = await orderRow(id);
    expect(row.discount_type).toBe("fixed");
    expect(Number(row.discount_value)).toBe(1.75); // 50% of 3.50
    expect(Number(row.discount_amount)).toBe(1.75);
    expect(pence(row.total)).toBe(bill(350, "takeaway", { type: "fixed", value: 1.75, reason: "vitest" }).totalPence);
  });

  it("a percent discount stays a percent of the smaller subtotal", async () => {
    const d = { type: "percent" as const, value: 10, reason: "vitest" };
    const id = await takeaway(undefined, { discount: d });
    const side = (await itemRows(id)).find((i) => i.menu_item_id === sideId);
    expect((await call(voidRoute, { order_id: id, item_id: side.id, reason: REASON }, owner)).status).toBe(200);
    const row = await orderRow(id);
    expect(Number(row.discount_amount)).toBe(1);
    expect(pence(row.total)).toBe(bill(1000, "takeaway", d).totalPence);
  });

  it("double void is harmless; last line -> 409; paid order -> 409", async () => {
    const id = await takeaway();
    const items = await itemRows(id);
    const [a, b] = await Promise.all([
      call(voidRoute, { order_id: id, item_id: items[0].id, reason: REASON }, owner),
      call(voidRoute, { order_id: id, item_id: items[0].id, reason: REASON }, manager),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await events(id, "item_voided")).toHaveLength(1);
    expect((await call(voidRoute, { order_id: id, item_id: items[1].id, reason: REASON }, owner)).status).toBe(409);

    const { id: paid } = await paidOrder();
    const pi = await itemRows(paid);
    expect((await call(voidRoute, { order_id: paid, item_id: pi[0].id, reason: REASON }, owner)).status).toBe(409);
    expect((await itemRows(paid)).every((i) => !i.voided_at)).toBe(true);
  });

  it("the payment after a void takes the new total; the bill leaves the line out; the KOT prints it as VOID", async () => {
    const id = await takeaway();
    const side = (await itemRows(id)).find((i) => i.menu_item_id === sideId);
    await call(voidRoute, { order_id: id, item_id: side.id, reason: REASON }, owner);
    const total = Number((await orderRow(id)).total);
    expect((await call(payRoute, { order_id: id, method: "cash", amount: total + 0.01, idempotency_key: key() }, staff)).status).toBe(400);
    expect((await call(payRoute, { order_id: id, method: "cash", amount: total, idempotency_key: key() }, staff)).status).toBe(201);
    const data = await loadPrintData(id, A);
    const receipt = buildReceipt(data!);
    expect(receipt.lines.map((l) => l.name)).toEqual(["Vitest Dish"]);
    const kot = buildKot(data!);
    expect(kot.lines.find((l) => l.name === "Vitest Side")?.voided).toBe(true);
    expect(kot.lines.find((l) => l.name === "Vitest Dish")?.voided).toBeUndefined();
  });

  it("items added after a void are priced on the lines that are left", async () => {
    const t = await db.from("restaurant_tables").insert({ restaurant_id: A, table_number: `CV${++counter}`, seats: 4 }).select("id").single();
    const seat = await call(seatRoute, { table_id: t.data!.id, party_size: 2 });
    const o = await call(orderRoute, {
      order_type: "dine_in",
      table_session_id: seat.json.session.id,
      notes: RUN_MARKER,
      items: [{ menu_item_id: dishId, quantity: 1 }, { menu_item_id: sideId, quantity: 1 }],
    });
    const id = o.json.order_id as string;
    const dish = (await itemRows(id)).find((i) => i.menu_item_id === dishId);
    expect((await call(voidRoute, { order_id: id, item_id: dish.id, reason: REASON }, owner)).status).toBe(200);
    expect((await call(addRoute, { order_id: id, items: [{ menu_item_id: sideId, quantity: 1 }] }, staff)).status).toBe(201);
    const row = await orderRow(id);
    expect(Number(row.subtotal)).toBe(7);
    expect(pence(row.total)).toBe(bill(700, "dine_in").totalPence);
  });
});

describe("tenant isolation", () => {
  it("another restaurant's owner gets 404 and nothing changes; a body restaurant_id is 403", async () => {
    const { id, total } = await paidOrder();
    const items = await itemRows(id);
    expect((await call(cancelRoute, { order_id: id, reason: REASON, refund_method: "cash", idempotency_key: key() }, ownerB)).status).toBe(404);
    expect((await call(refundRoute, { order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, ownerB)).status).toBe(404);
    expect((await call(voidRoute, { order_id: id, item_id: items[0].id, reason: REASON }, ownerB)).status).toBe(404);
    expect((await call(refundRoute, { restaurant_id: B, order_id: id, method: "cash", amount: 1, reason: REASON, idempotency_key: key() }, owner)).status).toBe(403);
    expect((await call(cancelRoute, { restaurant_id: B, order_id: id, reason: REASON }, owner)).status).toBe(403);
    const row = await orderRow(id);
    expect(row.status).toBe("new");
    expect(Number(row.paid_amount)).toBe(total);
  });
});

describe("board and reports", () => {
  it("the board shows the cancel reason, refunds and voided lines", async () => {
    const c = await takeaway();
    await call(cancelRoute, { order_id: c, reason: "Test order" }, staff);
    const { id: r } = await paidOrder();
    await call(refundRoute, { order_id: r, method: "card", amount: 2, reason: "Quality problem", idempotency_key: key() }, owner);
    const v = await takeaway();
    const side = (await itemRows(v)).find((i) => i.menu_item_id === sideId);
    await call(voidRoute, { order_id: v, item_id: side.id, reason: "Item not available" }, owner);

    const board = await loadBoardOrders(A, "staff", 500);
    const bc = board.find((o) => o.id === c)!;
    expect(bc).toMatchObject({ status: "cancelled", cancel_reason: "Test order" });
    const br = board.find((o) => o.id === r)!;
    expect(br.payment_status).toBe("partially_refunded");
    expect(br.refunds).toEqual([expect.objectContaining({ amount: 2, method: "card", reason: "Quality problem" })]);
    const bv = board.find((o) => o.id === v)!;
    expect(bv.items.find((i) => i.name === "Vitest Side")).toMatchObject({ voided: true, void_reason: "Item not available" });
    expect(JSON.stringify(bv)).not.toMatch(/cost|profit/i);
  });

  it("profit summary: cancelled orders are out, a refund comes off sales and profit", async () => {
    // A fresh restaurant so the sums cover only these orders.
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-cvr-rep`, tax_rate_percent: 20, max_discount_percent: 50 }).select("id").single();
    const R = r.data!.id as string;
    try {
      const m = await db.from("menu_items").insert({ restaurant_id: R, name: "Rep Dish", base_price: 10 }).select("id").single();
      await db.from("menu_costs").insert({ restaurant_id: R, menu_item_id: m.data!.id, cost_price: 4 });
      const rs = await staffCookie(R, "owner");
      const mk = async () => {
        const o = await call(orderRoute, { order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: m.data!.id, quantity: 1 }] }, rs);
        const id = o.json.order_id as string;
        await call(payRoute, { order_id: id, method: "cash", amount: 12, idempotency_key: key() }, rs);
        return id;
      };
      await mk(); // kept
      const refunded = await mk();
      const cancelled = await mk();
      await call(refundRoute, { order_id: refunded, method: "cash", amount: 6, reason: REASON, idempotency_key: key() }, rs);
      await call(cancelRoute, { order_id: cancelled, reason: REASON, refund_method: "cash", idempotency_key: key() }, rs);
      const from = new Date(Date.now() - 3600_000);
      const to = new Date(Date.now() + 3600_000);
      const s = await loadProfitSummary(R, { from, to, fromDate: "2000-01-01", toDateExclusive: "2000-01-02" });
      expect(s.orders).toBe(2);
      expect(s.sales).toBe(15); // 10 + (10 - 5)
      expect(s.grossProfit).toBe(7); // (10-4) + (10-4-5)
    } finally {
      await db.from("orders").delete().eq("restaurant_id", R);
      await db.from("restaurants").delete().eq("id", R);
    }
  });
});
