import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as seatTable } from "@/app/api/staff/seat-table/route";
import { POST as clearTable } from "@/app/api/staff/clear-table/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { SESSION_COOKIE, createSessionToken } from "@/lib/dashboard-auth";
import { ITEMS, RID, db } from "./helpers/helpers";

// Needs migration 0008 applied. Staff routes are called like the dashboard
// would: with the login cookie (or without it, to prove they refuse).

type Handler = (req: Request) => Promise<Response>;
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other test helpers */

async function callStaff(
  handler: Handler,
  body: unknown,
  cookie: string | null | undefined = undefined, // undefined = valid login, null = no cookie
): Promise<{ status: number; json: Record<string, any> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== null) headers.cookie = `${SESSION_COOKIE}=${cookie ?? createSessionToken()}`;
  const res = await handler(
    new Request("http://localhost/api/staff/test", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

const pence = (v: number | string) => Math.round(Number(v) * 100);
const sessionIds: string[] = [];
let tableId: string;
let secondTableId: string;
let bookingId: string;
let expectedSubtotal: number;

/** Seats a party and remembers the session for cleanup. */
async function seat(table: string, extra: Record<string, unknown> = {}) {
  const r = await callStaff(seatTable, { restaurant_id: RID, table_id: table, party_size: 2, ...extra });
  if (r.json.session?.id) sessionIds.push(r.json.session.id);
  return r;
}

/** Clears whoever is sitting at the table (if anyone), then seats a fresh party. */
async function reseat(table: string, extra: Record<string, unknown> = {}) {
  const { data: open } = await db.from("table_sessions").select("id").eq("table_id", table).is("cleared_at", null);
  for (const s of open ?? []) await callStaff(clearTable, { table_session_id: s.id });
  return seat(table, extra);
}

const order = (sessionId: string, items: unknown[] = defaultItems(), extra: Record<string, unknown> = {}) =>
  callStaff(manualOrder, { restaurant_id: RID, table_session_id: sessionId, items, ...extra });

const defaultItems = () => [
  { menu_item_id: ITEMS.pepperoni, size_name: "12 inch", quantity: 2, options: ["Extra cheese"] },
  { menu_item_id: ITEMS.garlicBread, quantity: 1 },
];

beforeAll(async () => {
  // Two tables with nobody sitting at them right now, so real sessions are never touched.
  const { data: tables } = await db.from("restaurant_tables").select("id").eq("restaurant_id", RID);
  const { data: open } = await db.from("table_sessions").select("table_id").is("cleared_at", null);
  const busy = new Set((open ?? []).map((o) => o.table_id));
  const free = (tables ?? []).map((t) => t.id).filter((id) => !busy.has(id));
  expect(free.length, "need two unoccupied tables for the staff tests").toBeGreaterThanOrEqual(2);
  [tableId, secondTableId] = free;

  // A booking to "arrive" (removed afterwards).
  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      restaurant_id: RID, table_id: tableId, customer_name: "Vitest Staff", customer_phone: "+447700900123",
      party_size: 2, booking_date: "2030-01-01", booking_time: "19:00", menu_preferences: "vitest-staff-endpoints",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  bookingId = booking!.id;

  // Expected subtotal, read from the database independently of the route.
  const [pep12, cheese, garlic] = await Promise.all([
    db.from("item_sizes").select("price").eq("menu_item_id", ITEMS.pepperoni).eq("name", "12 inch").single(),
    db.from("item_options").select("price_delta").eq("restaurant_id", RID).eq("name", "Extra Cheese").single(),
    db.from("menu_items").select("base_price").eq("id", ITEMS.garlicBread).single(),
  ]);
  expectedSubtotal =
    ((pence(pep12.data!.price) + pence(cheese.data!.price_delta)) * 2 + pence(garlic.data!.base_price)) / 100;
});

afterAll(async () => {
  // Orders first (they point at sessions), then sessions, then the booking.
  if (sessionIds.length) {
    await db.from("orders").delete().in("table_session_id", sessionIds);
    await db.from("table_sessions").delete().in("id", sessionIds);
  }
  await db.from("bookings").delete().eq("menu_preferences", "vitest-staff-endpoints");
});

describe("login required (no dashboard cookie -> 401)", () => {
  const fakeId = "00000000-0000-4000-8000-000000000000";
  const cases: [string, Handler, unknown][] = [
    ["seat-table", seatTable, { restaurant_id: RID, table_id: fakeId, party_size: 2 }],
    ["clear-table", clearTable, { table_session_id: fakeId }],
    ["manual-order", manualOrder, { restaurant_id: RID, table_session_id: fakeId, items: defaultItems() }],
  ];

  it.each(cases)("%s refuses a request with no cookie", async (_name, handler, body) => {
    const { status, json } = await callStaff(handler, body, null);
    expect(status).toBe(401);
    expect(json.success).toBe(false);
  });

  it.each(cases)("%s refuses a forged cookie", async (_name, handler, body) => {
    const { status } = await callStaff(handler, body, "9999999999999.notarealsignature");
    expect(status).toBe(401);
  });

  it.each(cases)("%s does not accept the voice agent's x-tool-secret instead", async (_name, handler, body) => {
    const res = await handler(
      new Request("http://localhost/api/staff/test", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tool-secret": process.env.TOOL_API_SECRET! },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("seat-table", () => {
  it("seats a walk-in (source walk_in, seated_at set, not cleared)", async () => {
    const { status, json } = await seat(tableId, { party_size: 3 });
    expect(status).toBe(201);
    expect(json.session.source).toBe("walk_in");
    expect(json.session.booking_id).toBeNull();
    expect(json.session.party_size).toBe(3);
    expect(json.session.seated_at).toBeTruthy();
    const { data } = await db.from("table_sessions").select("cleared_at").eq("id", json.session.id).single();
    expect(data!.cleared_at).toBeNull();
  });

  it("blocks double-seating an occupied table", async () => {
    const { status, json } = await seat(tableId);
    expect(status).toBe(409);
    expect(json.error).toMatch(/occupied/);
    const { data } = await db.from("table_sessions").select("id").eq("table_id", tableId).is("cleared_at", null);
    expect(data).toHaveLength(1); // still just the first party
  });

  it("seats a booked customer with source 'booking' and the booking linked", async () => {
    const { status, json } = await seat(secondTableId, { booking_id: bookingId });
    expect(status).toBe(201);
    expect(json.session.source).toBe("booking");
    expect(json.session.booking_id).toBe(bookingId);
  });

  it("rejects a party size of 0 and a table from another restaurant", async () => {
    expect((await seat(secondTableId, { party_size: 0 })).status).toBe(400);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await seat(unknown)).status).toBe(404);
  });
});

describe("clear-table", () => {
  it("clears an occupied table once, then refuses to clear it again", async () => {
    const seated = await reseat(tableId);
    expect(seated.status).toBe(201);
    const id = seated.json.session.id;

    const first = await callStaff(clearTable, { table_session_id: id });
    expect(first.status).toBe(200);
    expect(first.json.session.cleared_at).toBeTruthy();

    const again = await callStaff(clearTable, { table_session_id: id });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/already cleared/);

    // cleared_at must not have been overwritten by the second attempt.
    const { data } = await db.from("table_sessions").select("cleared_at").eq("id", id).single();
    expect(new Date(data!.cleared_at).toISOString()).toBe(new Date(first.json.session.cleared_at).toISOString());
  });

  it("lets the table be seated again after clearing", async () => {
    expect((await reseat(secondTableId)).status).toBe(201);
  });

  it("404s on an unknown session and 400s on a malformed id", async () => {
    expect((await callStaff(clearTable, { table_session_id: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    expect((await callStaff(clearTable, { table_session_id: "nope" })).status).toBe(400);
  });
});

describe("manual-order", () => {
  let walkInSession: string;
  let bookingSession: string;

  beforeAll(async () => {
    // Fresh sessions, one per source.
    walkInSession = (await reseat(tableId)).json.session.id;
    bookingSession = (await reseat(secondTableId, { booking_id: bookingId })).json.session.id;
  });

  it("prices the order from the database and saves it with source + table_session_id", async () => {
    const { status, json } = await order(walkInSession);
    expect(status).toBe(201);
    expect(json.subtotal).toBe(expectedSubtotal);
    expect(json.total).toBe(expectedSubtotal);
    expect(json.source).toBe("walk_in");

    const { data: saved } = await db
      .from("orders")
      .select("source, table_session_id, subtotal, delivery_fee, total, order_items(quantity, unit_price, line_total)")
      .eq("order_number", json.order_number)
      .single();
    expect(saved!.source).toBe("walk_in");
    expect(saved!.table_session_id).toBe(walkInSession);
    expect(Number(saved!.total)).toBe(expectedSubtotal);
    expect(Number(saved!.delivery_fee)).toBe(0);
    expect(saved!.order_items).toHaveLength(2);
    const lineSum = saved!.order_items.reduce((s: number, i: { line_total: number | string }) => s + pence(i.line_total), 0);
    expect(lineSum / 100).toBe(expectedSubtotal);
  });

  it("ignores any price or total sent by the client", async () => {
    const { status, json } = await order(
      walkInSession,
      [{ ...defaultItems()[1], unit_price: 0.01, line_total: 0.01, price: 0.01 }],
      { total: 0.01, subtotal: 0.01 },
    );
    expect(status).toBe(201);
    const { data: garlic } = await db.from("menu_items").select("base_price").eq("id", ITEMS.garlicBread).single();
    expect(json.total).toBe(Number(garlic!.base_price));
  });

  it("gives a booked table's order the source 'table_booking'", async () => {
    const { status, json } = await order(bookingSession);
    expect(status).toBe(201);
    expect(json.source).toBe("table_booking");
    const { data } = await db.from("orders").select("source, table_session_id").eq("order_number", json.order_number).single();
    expect(data!.source).toBe("table_booking");
    expect(data!.table_session_id).toBe(bookingSession);
  });

  it("rejects an invalid menu_item_id and saves nothing", async () => {
    const before = await db.from("orders").select("id", { count: "exact", head: true }).eq("table_session_id", walkInSession);
    const unknown = await order(walkInSession, [{ menu_item_id: "00000000-0000-4000-8000-000000000099", quantity: 1 }]);
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toMatch(/not found/);
    expect((await order(walkInSession, [{ menu_item_id: "not-a-uuid", quantity: 1 }])).status).toBe(400);
    const after = await db.from("orders").select("id", { count: "exact", head: true }).eq("table_session_id", walkInSession);
    expect(after.count).toBe(before.count);
  });

  it.each([0, -1, 21, 1.5])("rejects quantity %s", async (quantity) => {
    const { status } = await order(walkInSession, [{ menu_item_id: ITEMS.garlicBread, quantity }]);
    expect(status).toBe(400);
  });

  it("rejects an empty order, an unknown size and an unknown option", async () => {
    expect((await order(walkInSession, [])).status).toBe(400);
    expect((await order(walkInSession, [{ menu_item_id: ITEMS.pepperoni, size_name: "99 inch", quantity: 1 }])).status).toBe(400);
    expect((await order(walkInSession, [{ menu_item_id: ITEMS.garlicBread, quantity: 1, options: ["Unicorn dust"] }])).status).toBe(400);
  });

  it("refuses an order for a cleared table or an unknown session", async () => {
    const { data: s } = await db.from("table_sessions").select("id").eq("id", bookingSession).single();
    await callStaff(clearTable, { table_session_id: s!.id });
    expect((await order(bookingSession)).status).toBe(409);
    expect((await order("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
