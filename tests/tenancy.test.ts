import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as clearTable } from "@/app/api/staff/clear-table/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as recordPayment } from "@/app/api/staff/record-payment/route";
import { POST as seatTable } from "@/app/api/staff/seat-table/route";
import { POST as updateBookingStatus } from "@/app/api/staff/update-booking-status/route";
import { POST as updateOrderStatus } from "@/app/api/staff/update-order-status/route";
import PrintBillPage from "@/app/dashboard/print/bill/[orderId]/page";
import PrintKotPage from "@/app/dashboard/print/kot/[orderId]/page";
import { requireStaff } from "@/lib/staff-auth";
import { SESSION_COOKIE } from "@/lib/session";
import { RUN_MARKER, db, sessionToken, staffCookie } from "./helpers/helpers";

// P8a tenancy: the restaurant ALWAYS comes from the login session. Two
// throwaway restaurants (A and B, names "vitest-run-..."); a login of A must
// never reach B's orders, menu items, bookings, tables, payments or print pages.
// The demo restaurant is never touched.

// The print pages read the login cookie through next/headers; give them ours.
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "staff_session" && cookieJar.value ? { name, value: cookieJar.value } : undefined),
  }),
}));

type Handler = (req: Request) => Promise<Response>;
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function call(handler: Handler, body: unknown, cookie: string | null): Promise<{ status: number; json: Record<string, any> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await handler(new Request("http://localhost/api/staff/test", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}

let A: string;
let B: string;
const b = {} as { order: string; item: string; booking: string; table: string; freeTable: string; session: string };
let aOrder: string;

beforeAll(async () => {
  const r = await db
    .from("restaurants")
    .insert([{ name: `${RUN_MARKER}-tenant-A`, delivery_fee: 0 }, { name: `${RUN_MARKER}-tenant-B`, delivery_fee: 0 }])
    .select("id, name");
  if (r.error) throw r.error;
  A = r.data.find((x) => x.name.endsWith("-A"))!.id;
  B = r.data.find((x) => x.name.endsWith("-B"))!.id;

  const order = (rid: string) => ({ restaurant_id: rid, fulfilment_type: "pickup", subtotal: 10, total: 10, notes: RUN_MARKER });
  const [ordersRes, itemRes, tablesRes] = await Promise.all([
    db.from("orders").insert([order(B), order(A)]).select("id, restaurant_id"),
    db.from("menu_items").insert({ restaurant_id: B, name: "Vitest B Dish", base_price: 10 }).select("id").single(),
    db
      .from("restaurant_tables")
      .insert([
        { restaurant_id: B, table_number: `${RUN_MARKER}-B1`, seats: 4 },
        { restaurant_id: B, table_number: `${RUN_MARKER}-B2`, seats: 4 },
      ])
      .select("id, table_number"),
  ]);
  for (const res of [ordersRes, itemRes, tablesRes]) if (res.error) throw res.error;
  b.order = ordersRes.data!.find((o) => o.restaurant_id === B)!.id;
  aOrder = ordersRes.data!.find((o) => o.restaurant_id === A)!.id;
  b.item = itemRes.data!.id;
  b.table = tablesRes.data!.find((t) => t.table_number.endsWith("-B1"))!.id;
  b.freeTable = tablesRes.data!.find((t) => t.table_number.endsWith("-B2"))!.id;

  const [bookingRes, sessionRes] = await Promise.all([
    db
      .from("bookings")
      .insert({
        restaurant_id: B, table_id: null, customer_name: "Vitest Tenant", customer_phone: "07700900123",
        party_size: 2, booking_date: "2031-06-01", booking_time: "19:00", menu_preferences: RUN_MARKER,
      })
      .select("id")
      .single(),
    db.from("table_sessions").insert({ restaurant_id: B, table_id: b.table, party_size: 2, source: "walk_in" }).select("id").single(),
  ]);
  for (const res of [bookingRes, sessionRes]) if (res.error) throw res.error;
  b.booking = bookingRes.data!.id;
  b.session = sessionRes.data!.id;
});

afterAll(async () => {
  // Children first: a restaurant can't be deleted while it has orders or bookings.
  const steps = [
    () => db.from("orders").delete().like("notes", `${RUN_MARKER}%`),
    () => db.from("bookings").delete().like("menu_preferences", `${RUN_MARKER}%`),
    () => db.from("restaurant_tables").delete().like("table_number", `${RUN_MARKER}%`),
    () => db.from("restaurants").delete().in("id", [A, B]),
  ];
  for (const step of steps) {
    const res = await step();
    if (res.error) throw res.error;
  }
});

describe("a login of restaurant A cannot touch restaurant B", () => {
  const asA = () => staffCookie(A);

  it("order status: B's order is 'not found' (404) and unchanged", async () => {
    expect((await call(updateOrderStatus, { order_id: b.order, status: "preparing" }, await asA())).status).toBe(404);
    expect((await db.from("orders").select("status").eq("id", b.order).single()).data?.status).toBe("new");
  });

  it("payment: B's order is 'not found' (404) and nothing is recorded", async () => {
    const r = await call(recordPayment, { order_id: b.order, method: "cash", amount: 10, idempotency_key: randomUUID() }, await asA());
    expect(r.status).toBe(404);
    expect((await db.from("order_payments").select("id").eq("order_id", b.order)).data).toHaveLength(0);
  });

  it("menu item: B's dish can't be priced or ordered from A (400, unknown item) and no order is made", async () => {
    const items = [{ menu_item_id: b.item, quantity: 1 }];
    const preview = await call(pricePreview, { order_type: "takeaway", items }, await asA());
    expect(preview.status).toBe(400);
    expect(preview.json.error).toMatch(/not found for this restaurant/);
    const before = (await db.from("orders").select("id", { count: "exact", head: true }).in("restaurant_id", [A, B])).count;
    const order = await call(manualOrder, { order_type: "takeaway", notes: RUN_MARKER, items }, await asA());
    expect(order.status).toBe(400);
    const after = (await db.from("orders").select("id", { count: "exact", head: true }).in("restaurant_id", [A, B])).count;
    expect(after).toBe(before);
  });

  it("dine-in: B's table session can't take an order from A (404)", async () => {
    const r = await call(manualOrder, { table_session_id: b.session, notes: RUN_MARKER, items: [{ menu_item_id: b.item, quantity: 1 }] }, await asA());
    expect(r.status).toBe(404);
  });

  it("booking: B's booking is 'not found' (404) and unchanged", async () => {
    expect((await call(updateBookingStatus, { booking_id: b.booking, status: "cancelled" }, await asA())).status).toBe(404);
    expect((await db.from("bookings").select("status").eq("id", b.booking).single()).data?.status).toBe("confirmed");
  });

  it("tables: A can't seat B's table or clear B's table session (404)", async () => {
    expect((await call(seatTable, { table_id: b.freeTable, party_size: 2 }, await asA())).status).toBe(404);
    expect((await call(clearTable, { table_session_id: b.session }, await asA())).status).toBe(404);
    expect((await db.from("table_sessions").select("cleared_at").eq("id", b.session).single()).data?.cleared_at).toBeNull();
    expect((await db.from("table_sessions").select("id").eq("table_id", b.freeTable)).data).toHaveLength(0);
  });

  it("print bill and print KOT: B's order is a 404 page; A's own order prints", async () => {
    cookieJar.value = await sessionToken(A);
    try {
      const props = (orderId: string) => ({ params: Promise.resolve({ orderId }), searchParams: Promise.resolve({}) });
      for (const Page of [PrintBillPage, PrintKotPage]) {
        const err = await Page(props(b.order)).then(() => null, (e: unknown) => e as { digest?: string });
        expect(err?.digest).toMatch(/404/);
        await expect(Page(props(aOrder))).resolves.toBeTruthy();
      }
    } finally {
      cookieJar.value = undefined;
    }
  });

  it("print pages without a login go to the login page", async () => {
    const err = await PrintBillPage({ params: Promise.resolve({ orderId: aOrder }), searchParams: Promise.resolve({}) }).then(
      () => null,
      (e: unknown) => e as { digest?: string },
    );
    expect(err?.digest).toMatch(/NEXT_REDIRECT.*\/dashboard\/login/);
  });
});

describe("restaurant_id in the body must match the login (else 403)", () => {
  const cases: [string, Handler, () => Record<string, unknown>][] = [
    ["update-order-status", updateOrderStatus, () => ({ order_id: aOrder, status: "preparing" })],
    ["record-payment", recordPayment, () => ({ order_id: aOrder, method: "cash", amount: 1, idempotency_key: randomUUID() })],
    ["price-preview", pricePreview, () => ({ order_type: "takeaway", items: [{ menu_item_id: b.item, quantity: 1 }] })],
    ["manual-order", manualOrder, () => ({ order_type: "takeaway", notes: RUN_MARKER, items: [{ menu_item_id: b.item, quantity: 1 }] })],
    ["update-booking-status", updateBookingStatus, () => ({ booking_id: b.booking, status: "cancelled" })],
    ["seat-table", seatTable, () => ({ table_id: b.freeTable, party_size: 2 })],
    ["clear-table", clearTable, () => ({ table_session_id: b.session })],
  ];

  it.each(cases)("%s: a different restaurant_id is refused (403) before anything changes", async (_n, handler, body) => {
    const r = await call(handler, { ...body(), restaurant_id: B }, await staffCookie(A));
    expect(r.status).toBe(403);
    expect(r.json.success).toBe(false);
  });

  it("the same restaurant_id as the login is accepted (older dashboard tabs)", async () => {
    const r = await call(updateOrderStatus, { restaurant_id: A, order_id: aOrder, status: "preparing" }, await staffCookie(A));
    expect(r.status).toBe(200);
  });

  it("nothing of B changed during the 403 checks", async () => {
    expect((await db.from("bookings").select("status").eq("id", b.booking).single()).data?.status).toBe("confirmed");
    expect((await db.from("table_sessions").select("cleared_at").eq("id", b.session).single()).data?.cleared_at).toBeNull();
    expect((await db.from("order_payments").select("id").eq("order_id", aOrder)).data).toHaveLength(0);
  });
});

describe("no login -> 401 on every /api/staff/* route", () => {
  const routes: [string, Handler][] = [
    ["update-order-status", updateOrderStatus],
    ["record-payment", recordPayment],
    ["price-preview", pricePreview],
    ["manual-order", manualOrder],
    ["update-booking-status", updateBookingStatus],
    ["seat-table", seatTable],
    ["clear-table", clearTable],
  ];
  it.each(routes)("%s: no cookie, a forged cookie, or an old dashboard_session cookie -> 401", async (_n, handler) => {
    for (const cookie of [null, `${SESSION_COOKIE}=123.bad`, `dashboard_session=${Date.now() + 1e9}.abc`]) {
      expect((await call(handler, { restaurant_id: A }, cookie)).status).toBe(401);
    }
  });
});

describe("role helper (P8b: owner-only pages and routes)", () => {
  const req = async (role: "owner" | "staff") => new Request("http://localhost/api/staff/x", { headers: { cookie: await staffCookie(A, role) } });
  it("requireStaff({ role: 'owner' }) lets an owner in and refuses staff (403)", async () => {
    expect((await requireStaff(await req("owner"), { role: "owner" })).ok).toBe(true);
    const denied = await requireStaff(await req("staff"), { role: "owner" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);
    expect((await requireStaff(await req("staff"))).ok).toBe(true);
  });
});

describe("switching an account off (is_active = false) takes effect at once", () => {
  const request = (cookie: string) => new Request("http://localhost/api/staff/x", { headers: { cookie } });
  const makeAccount = async (restaurantId: string, role: "owner" | "staff") => {
    const id = randomUUID();
    const r = await db
      .from("staff_accounts")
      .insert({ id, restaurant_id: restaurantId, username: `${RUN_MARKER}-off-${id.slice(0, 8)}`, password_hash: "scrypt$test-only", role });
    if (r.error) throw r.error;
    return { id, cookie: `${SESSION_COOKIE}=${await sessionToken(restaurantId, role, id)}` };
  };

  it("an API call with a still-valid cookie gets 401 right after the account is switched off, and works again when switched on", async () => {
    const acc = await makeAccount(A, "staff");
    expect((await requireStaff(request(acc.cookie))).ok).toBe(true);
    expect((await call(updateOrderStatus, { order_id: aOrder, status: "preparing" }, acc.cookie)).status).not.toBe(401);

    await db.from("staff_accounts").update({ is_active: false }).eq("id", acc.id);
    const off = await call(updateOrderStatus, { order_id: aOrder, status: "preparing" }, acc.cookie);
    expect(off.status).toBe(401);
    const check = await requireStaff(request(acc.cookie));
    expect(check.ok).toBe(false);

    await db.from("staff_accounts").update({ is_active: true }).eq("id", acc.id);
    expect((await requireStaff(request(acc.cookie))).ok).toBe(true);
  });

  it("a deleted account, or one moved to another restaurant, is refused too", async () => {
    const gone = await makeAccount(A, "owner");
    await db.from("staff_accounts").delete().eq("id", gone.id);
    expect((await requireStaff(request(gone.cookie))).ok).toBe(false);

    const moved = await makeAccount(A, "owner");
    await db.from("staff_accounts").update({ restaurant_id: B }).eq("id", moved.id);
    expect((await requireStaff(request(moved.cookie))).ok).toBe(false);
  });

  it("the role comes from the database: demoting an owner takes effect at once", async () => {
    const acc = await makeAccount(A, "owner");
    expect((await requireStaff(request(acc.cookie), { role: "owner" })).ok).toBe(true);
    await db.from("staff_accounts").update({ role: "staff" }).eq("id", acc.id);
    const r = await requireStaff(request(acc.cookie), { role: "owner" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("dashboard pages: a switched-off account has no session (getStaffSession returns null)", async () => {
    const { getStaffSession } = await import("@/lib/staff-page");
    const acc = await makeAccount(A, "owner");
    cookieJar.value = acc.cookie.split("=")[1];
    expect((await getStaffSession())?.restaurantId).toBe(A);
    await db.from("staff_accounts").update({ is_active: false }).eq("id", acc.id);
    expect(await getStaffSession()).toBeNull();
  });
});
