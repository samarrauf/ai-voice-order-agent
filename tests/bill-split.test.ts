import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as splitRoute } from "@/app/api/staff/split-bill/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as payRoute } from "@/app/api/staff/record-payment/route";
import { POST as cancelRoute } from "@/app/api/staff/cancel-order/route";
import { decodeSplit, type SplitSpec } from "@/lib/bill-split";
import { pence } from "@/lib/order-pricing";
import { loadPrintData } from "@/lib/receipt-data";
import { buildReceipt } from "@/lib/receipt";
import { buildSplitReceipts } from "@/lib/split-receipt";
import { RUN_MARKER, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// B4c: bill split end to end, on THROWAWAY restaurants only ("vitest-run-...").
// Needs migration 0030 (order_payments.payer_label, record_payment_tx with payer limit).
//   A: GBP, tax 20%, service 12.5% on all, discounts up to 50%.
//   P: PKR, rounding_step 1, tax 16%, service 10% on all.
//   B: another restaurant (tenant isolation).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let P: string;
let B: string;
let staffA: string;
let ownerA: string;
let staffP: string;
let staffB: string;
const menu: Record<string, string> = {};

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: Record<string, unknown>, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const key = () => `vitest-key-${Math.random().toString(36).slice(2)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const orderRow = async (id: string) => (await db.from("orders").select("*").eq("id", id).single()).data as any;
const payRows = async (id: string) => ((await db.from("order_payments").select("*").eq("order_id", id).order("created_at")).data ?? []) as any[];

async function makeOrder(cookie: string, items: { name: string; quantity: number }[], discount?: { type: "percent" | "fixed"; value: number }) {
  const o = await call(
    orderRoute,
    {
      order_type: "takeaway",
      notes: RUN_MARKER,
      items: items.map((i) => ({ menu_item_id: menu[i.name], quantity: i.quantity })),
      ...(discount ? { discount: { ...discount, reason: "vitest" } } : {}),
    },
    cookie,
  );
  expect(o.status, JSON.stringify(o.json)).toBe(201);
  const id = o.json.order_id as string;
  const lines = ((await db.from("order_items").select("id, item_name").eq("order_id", id).order("created_at")).data ?? []) as any[];
  return { id, row: await orderRow(id), lines };
}

/** The guests' shares in pence, after checking every part adds up to the saved order. */
function expectExactAgainstRow(row: any, guests: any[]) {
  const p = (k: string) => sum(guests.map((g) => pence(g[k])));
  expect(p("total")).toBe(pence(row.total));
  expect(p("subtotal")).toBe(pence(row.subtotal));
  expect(p("discount")).toBe(pence(row.discount_amount));
  expect(p("service_charge")).toBe(pence(row.service_charge_amount));
  expect(p("tax")).toBe(pence(row.tax_amount));
  expect(p("rounding")).toBe(pence(row.rounding_amount));
  for (const g of guests) expect(pence(g.total)).toBeGreaterThan(0);
}

beforeAll(async () => {
  const made = await db
    .from("restaurants")
    .insert([
      {
        name: `${RUN_MARKER}-split-a`, currency: "GBP", rounding_step: 0.01, tax_rate_percent: 20,
        service_charge_percent: 12.5, service_charge_applies_to: "all", max_discount_percent: 50,
      },
      {
        name: `${RUN_MARKER}-split-p`, currency: "PKR", rounding_step: 1, tax_rate_percent: 16,
        service_charge_percent: 10, service_charge_applies_to: "all", max_discount_percent: 20,
      },
      {
        name: `${RUN_MARKER}-split-b`, currency: "GBP", rounding_step: 0.01, tax_rate_percent: 0,
        service_charge_percent: 0, service_charge_applies_to: "none", max_discount_percent: 0,
      },
    ])
    .select("id, name");
  if (made.error) throw made.error;
  A = made.data.find((r) => r.name.endsWith("-split-a"))!.id;
  P = made.data.find((r) => r.name.endsWith("-split-p"))!.id;
  B = made.data.find((r) => r.name.endsWith("-split-b"))!.id;
  const m = await db
    .from("menu_items")
    .insert([
      { restaurant_id: A, name: "Split Pizza", base_price: 12.99 },
      { restaurant_id: A, name: "Split Side", base_price: 3.49 },
      { restaurant_id: A, name: "Split Drink", base_price: 2.25 },
      { restaurant_id: P, name: "Split Karahi", base_price: 1850 },
      { restaurant_id: P, name: "Split Naan", base_price: 60 },
    ])
    .select("id, name");
  if (m.error) throw m.error;
  for (const r of m.data) menu[r.name] = r.id;
  staffA = await staffCookie(A, "staff");
  ownerA = await staffCookie(A, "owner");
  staffP = await staffCookie(P, "staff");
  staffB = await staffCookie(B, "owner");
});

afterAll(async () => {
  await cleanupTestOrders();
  for (const rid of [A, P, B]) if (rid) await db.from("restaurants").delete().eq("id", rid);
});

describe("split-bill route", () => {
  it("needs a login; another restaurant's order is 404; a different restaurant_id is 403", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }]);
    expect((await call(splitRoute, { order_id: o.id }, null)).status).toBe(401);
    expect((await call(splitRoute, { order_id: o.id, split: { mode: "equal", guests: 2 } }, staffB)).status).toBe(404);
    expect((await call(splitRoute, { order_id: o.id, restaurant_id: B }, staffA)).status).toBe(403);
  });

  it("without a split: the order's lines and total, from the database", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 2 }, { name: "Split Drink", quantity: 1 }]);
    const r = await call(splitRoute, { order_id: o.id }, staffA);
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(Number(o.row.total));
    expect(r.json.items.map((i: any) => i.name)).toEqual(["Split Pizza", "Split Drink"]);
    expect(r.json.guests).toBeUndefined();
  });

  for (const n of [2, 3, 7]) {
    it(`equal split between ${n} guests, with discount + service charge + tax: adds up exactly`, async () => {
      const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 3 }, { name: "Split Side", quantity: 2 }, { name: "Split Drink", quantity: 3 }], {
        type: "percent",
        value: 15,
      });
      expect(Number(o.row.discount_amount)).toBeGreaterThan(0);
      expect(Number(o.row.service_charge_amount)).toBeGreaterThan(0);
      const r = await call(splitRoute, { order_id: o.id, split: { mode: "equal", guests: n } }, staffA);
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      expect(r.json.guests).toHaveLength(n);
      expectExactAgainstRow(o.row, r.json.guests);
      const t = r.json.guests.map((g: any) => pence(g.total));
      expect(Math.max(...t) - Math.min(...t)).toBeLessThanOrEqual(1);
      expect(decodeSplit(new URL(r.json.print_href, "http://x").searchParams.get("split"))).toEqual({ mode: "equal", guests: n });
    });
  }

  it("PKR (rounding_step 1): every guest pays whole rupees and the sum is the total", async () => {
    const o = await makeOrder(staffP, [{ name: "Split Karahi", quantity: 1 }, { name: "Split Naan", quantity: 5 }], { type: "percent", value: 7 });
    expect(pence(o.row.total) % 100).toBe(0);
    for (const n of [2, 3, 7]) {
      const r = await call(splitRoute, { order_id: o.id, split: { mode: "equal", guests: n } }, staffP);
      expect(r.status).toBe(200);
      expectExactAgainstRow(o.row, r.json.guests);
      for (const g of r.json.guests) expect(pence(g.total) % 100).toBe(0);
    }
  });

  it("by items: one item shared by several guests; each guest gets their own items", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }, { name: "Split Side", quantity: 1 }, { name: "Split Drink", quantity: 1 }]);
    const [pizza, side, drink] = o.lines.map((l) => l.id);
    const split: SplitSpec = { mode: "items", guests: 3, assign: { [pizza]: [1, 2, 3], [side]: [2], [drink]: [3] } };
    const r = await call(splitRoute, { order_id: o.id, split }, staffA);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expectExactAgainstRow(o.row, r.json.guests);
    expect(sum(r.json.guests.flatMap((g: any) => g.items.filter((i: any) => i.id === pizza).map((i: any) => pence(i.amount))))).toBe(1299);
    expect(r.json.guests[0].items).toEqual([{ id: pizza, shared_with: 3, amount: 4.33 }]);
    expect(r.json.guests[1].items.map((i: any) => i.id)).toEqual([pizza, side]);
  });

  it("refuses a split that does not fit the order (server checks; the browser's sums are not used)", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }, { name: "Split Side", quantity: 1 }]);
    const [pizza] = o.lines.map((l) => l.id);
    const total = pence(o.row.total);
    const bad: SplitSpec[] = [
      { mode: "amounts", amounts: [100, total - 101] },
      { mode: "amounts", amounts: [100, total] },
      { mode: "items", guests: 2, assign: { [pizza]: [1] } },
      { mode: "items", guests: 2, assign: { [pizza]: [1], "00000000-0000-4000-8000-000000000009": [2] } },
    ];
    for (const split of bad) {
      const r = await call(splitRoute, { order_id: o.id, split }, staffA);
      expect(r.status, JSON.stringify(split)).toBe(400);
      expect(r.json.success).toBe(false);
    }
    // Zero / negative shares are not even accepted as input.
    expect((await call(splitRoute, { order_id: o.id, split: { mode: "amounts", amounts: [0, total] } }, staffA)).status).toBe(400);
    expect((await call(splitRoute, { order_id: o.id, split: { mode: "equal", guests: 1 } }, staffA)).status).toBe(400);
    // Amounts that add up are taken as typed.
    const okR = await call(splitRoute, { order_id: o.id, split: { mode: "amounts", amounts: [500, total - 500] } }, staffA);
    expect(okR.status).toBe(200);
    expect(okR.json.guests.map((g: any) => pence(g.total))).toEqual([500, total - 500]);
    expectExactAgainstRow(o.row, okR.json.guests);
  });
});

describe("paying a split bill", () => {
  it("each guest pays their share by a different method; payer_label is saved; the order ends paid", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 2 }, { name: "Split Drink", quantity: 3 }], { type: "fixed", value: 2 });
    const split: SplitSpec = { mode: "equal", guests: 3 };
    const shares = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests as any[];
    const methods = ["cash", "card", "online"];
    for (const g of shares) {
      const p = await call(payRoute, { order_id: o.id, method: methods[g.guest - 1], amount: g.total, idempotency_key: key(), split, guest: g.guest }, staffA);
      expect(p.status, JSON.stringify(p.json)).toBe(201);
    }
    const rows = await payRows(o.id);
    expect(rows.map((r) => [r.payer_label, r.method, pence(r.amount)])).toEqual(shares.map((g) => [g.label, methods[g.guest - 1], pence(g.total)]));
    const row = await orderRow(o.id);
    expect(row.payment_status).toBe("paid");
    expect(pence(row.paid_amount)).toBe(pence(row.total));
    // The split view now shows everyone paid.
    const after = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests as any[];
    expect(after.every((g) => g.balance === 0 && pence(g.paid) === pence(g.total))).toBe(true);
    // Fully paid: the old rule still refuses more money.
    const more = await call(payRoute, { order_id: o.id, method: "cash", amount: 0.01, idempotency_key: key(), split, guest: 1 }, staffA);
    expect(more.status).toBe(409);
  });

  it("a guest cannot pay more than their share (overpayment refused, nothing saved); part payments add up", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 2 }]);
    const split: SplitSpec = { mode: "equal", guests: 2 };
    const share = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests[0].total as number;
    const over = await call(payRoute, { order_id: o.id, method: "cash", amount: share + 0.01, idempotency_key: key(), split, guest: 1 }, staffA);
    expect(over.status).toBe(400);
    expect(over.json.error).toMatch(/share/);
    expect(await payRows(o.id)).toHaveLength(0);
    // Two part payments from guest 1 up to the share are fine; one more penny is not.
    const half = Math.floor(pence(share) / 2) / 100;
    expect((await call(payRoute, { order_id: o.id, method: "cash", amount: half, idempotency_key: key(), split, guest: 1 }, staffA)).status).toBe(201);
    const rest = (pence(share) - pence(half)) / 100;
    expect((await call(payRoute, { order_id: o.id, method: "card", amount: rest, idempotency_key: key(), split, guest: 1 }, staffA)).status).toBe(201);
    expect((await call(payRoute, { order_id: o.id, method: "card", amount: 0.01, idempotency_key: key(), split, guest: 1 }, staffA)).status).toBe(400);
    const g1 = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests[0];
    expect(g1.balance).toBe(0);
    expect((await orderRow(o.id)).payment_status).toBe("partial");
  });

  it("two payments for the same guest at the same moment: only one fits the share (database lock)", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 2 }]);
    const split: SplitSpec = { mode: "equal", guests: 2 };
    const share = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests[1].total as number;
    const [a, b] = await Promise.all([
      call(payRoute, { order_id: o.id, method: "cash", amount: share, idempotency_key: key(), split, guest: 2 }, staffA),
      call(payRoute, { order_id: o.id, method: "card", amount: share, idempotency_key: key(), split, guest: 2 }, staffA),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect((await payRows(o.id)).filter((r) => r.payer_label === "Guest 2")).toHaveLength(1);
  });

  it("the old record_payment rules still hold: idempotency, order overpayment, plain payments, cancelled orders", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }, { name: "Split Side", quantity: 1 }]);
    const split: SplitSpec = { mode: "equal", guests: 2 };
    const shares = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests as any[];
    // Same key twice = one payment.
    const k = key();
    const first = await call(payRoute, { order_id: o.id, method: "card", amount: 5, idempotency_key: k, split, guest: 1 }, staffA);
    const again = await call(payRoute, { order_id: o.id, method: "card", amount: 5, idempotency_key: k, split, guest: 1 }, staffA);
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.json.duplicate).toBe(true);
    // Same key for another guest is a clash, not a payment.
    const clash = await call(payRoute, { order_id: o.id, method: "card", amount: 5, idempotency_key: k, split, guest: 2 }, staffA);
    expect(clash.status).toBe(409);
    expect(await payRows(o.id)).toHaveLength(1);
    // A plain payment (no split) still works and has no label.
    expect((await call(payRoute, { order_id: o.id, method: "cash", amount: 1, idempotency_key: key() }, staffA)).status).toBe(201);
    expect((await payRows(o.id)).map((r) => r.payer_label)).toEqual(["Guest 1", null]);
    // More than the order still owes is refused even inside a guest's share.
    expect(shares).toHaveLength(2);
    const owed = pence(o.row.total) - 600;
    const tooMuch = await call(payRoute, { order_id: o.id, method: "cash", amount: (owed + 1) / 100, idempotency_key: key() }, staffA);
    expect(tooMuch.status).toBe(400);
    // split and guest go together; a guest outside the split is refused.
    expect((await call(payRoute, { order_id: o.id, method: "cash", amount: 1, idempotency_key: key(), split }, staffA)).status).toBe(400);
    expect((await call(payRoute, { order_id: o.id, method: "cash", amount: 1, idempotency_key: key(), split, guest: 3 }, staffA)).status).toBe(400);
    // A split that does not fit the order cannot be used to pay.
    const badSplit = { mode: "amounts", amounts: [100, 100] };
    expect((await call(payRoute, { order_id: o.id, method: "cash", amount: 1, idempotency_key: key(), split: badSplit, guest: 1 }, staffA)).status).toBe(400);
    expect(await payRows(o.id)).toHaveLength(2);

    // A cancelled order takes no split payment either.
    const c = await makeOrder(staffA, [{ name: "Split Drink", quantity: 2 }]);
    expect((await call(cancelRoute, { order_id: c.id, reason: "Duplicate order" }, ownerA)).status).toBe(200);
    const cp = await call(payRoute, { order_id: c.id, method: "cash", amount: 1, idempotency_key: key(), split, guest: 1 }, staffA);
    expect(cp.status).toBe(409);
  });

  it("tenant isolation: another restaurant cannot see or pay this order's split", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }]);
    const split: SplitSpec = { mode: "equal", guests: 2 };
    expect((await call(splitRoute, { order_id: o.id, split }, staffB)).status).toBe(404);
    const p = await call(payRoute, { order_id: o.id, method: "cash", amount: 1, idempotency_key: key(), split, guest: 1 }, staffB);
    expect(p.status).toBe(404);
    expect((await call(payRoute, { order_id: o.id, restaurant_id: B, method: "cash", amount: 1, idempotency_key: key(), split, guest: 1 }, staffA)).status).toBe(403);
    expect(await payRows(o.id)).toHaveLength(0);
    expect(await loadPrintData(o.id, B)).toBeNull();
  });
});

describe("split bills on paper", () => {
  it("one receipt per guest from the saved order; each shows only that guest's payments; the full bill is unchanged", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Pizza", quantity: 1 }, { name: "Split Side", quantity: 1 }, { name: "Split Drink", quantity: 1 }], {
      type: "percent",
      value: 10,
    });
    const [pizza, side, drink] = o.lines.map((l) => l.id);
    const split: SplitSpec = { mode: "items", guests: 2, assign: { [pizza]: [1], [side]: [1, 2], [drink]: [2] } };
    const shares = (await call(splitRoute, { order_id: o.id, split }, staffA)).json.guests as any[];
    expect((await call(payRoute, { order_id: o.id, method: "card", amount: shares[1].total, idempotency_key: key(), split, guest: 2 }, staffA)).status).toBe(201);

    const data = await loadPrintData(o.id, A);
    expect(data).not.toBeNull();
    const built = buildSplitReceipts(data!, split);
    if (!built.ok) throw new Error(built.error);
    expect(built.receipts.map((r) => r.partOf)).toEqual([
      `Part of Order ${o.row.order_number} · Guest 1 of 2`,
      `Part of Order ${o.row.order_number} · Guest 2 of 2`,
    ]);
    expect(built.receipts[0].lines.map((l) => l.name)).toEqual(["Split Pizza", "Split Side"]);
    expect(built.receipts[1].lines.map((l) => l.name)).toEqual(["Split Side", "Split Drink"]);
    expect(built.receipts[0].payments).toEqual([]);
    expect(built.receipts[1].payments).toHaveLength(1);
    expect(built.receipts[1].paymentStatus).toBe("paid");
    expect(built.receipts[0].paymentStatus).toBe("unpaid");

    const full = buildReceipt(data!);
    expect(full.lines).toHaveLength(3);
    expect(full.payments).toHaveLength(1);
    expect(full.paymentStatus).toBe("partial");
  });
});

describe("database function", () => {
  it("a payer limit needs a label; the browser's anon key cannot call record_payment_tx", async () => {
    const o = await makeOrder(staffA, [{ name: "Split Drink", quantity: 1 }]);
    const r = await db.rpc("record_payment_tx", {
      p_restaurant_id: A,
      p_order_id: o.id,
      p_method: "cash",
      p_amount: 1,
      p_reference: null,
      p_created_by: "vitest",
      p_idempotency_key: key(),
      p_payer_label: null,
      p_payer_limit: 5,
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ ok: false, error: "payer_label_required" });

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const a = await anon.rpc("record_payment_tx", {
      p_restaurant_id: A,
      p_order_id: o.id,
      p_method: "cash",
      p_amount: 1,
      p_reference: null,
      p_created_by: "vitest",
      p_idempotency_key: key(),
      p_payer_label: "Guest 1",
      p_payer_limit: 5,
    });
    expect(a.error?.code).toBe("42501");
    expect(await payRows(o.id)).toHaveLength(0);
  });
});
