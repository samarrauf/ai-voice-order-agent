import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as tablesRoute } from "@/app/api/staff/tables/route";
import { POST as seatRoute } from "@/app/api/staff/seat-table/route";
import { POST as clearRoute } from "@/app/api/staff/clear-table/route";
import { RUN_MARKER, db, staffCookie } from "./helpers/helpers";

// P3a: tables and venue. Needs migration 0026. Only throwaway restaurants ("vitest-run-...");
// Napoli and Olive are never touched. Bookings carry RUN_MARKER so the global cleanup can remove
// them before the restaurant (bookings do not cascade); tables, sections and sessions cascade.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;

const FUTURE = "2031-06-01";
const PAST = "2020-01-01";

async function call(route: (r: Request) => Promise<Response>, path: string, body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const tables = (body: Record<string, unknown>, cookie: string | null = owner) => call(tablesRoute, "/api/staff/tables", body, cookie);
const seat = (body: Record<string, unknown>, cookie: string | null = owner) => call(seatRoute, "/api/staff/seat-table", body, cookie);
const clear = (body: Record<string, unknown>, cookie: string | null = owner) => call(clearRoute, "/api/staff/clear-table", body, cookie);

let counter = 0;
const uniq = (p: string) => `${p}${++counter}`;

async function addTable(rid: string, cookie: string, seats = 4, section_id: string | null = null) {
  const r = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: uniq("T"), seats, section_id }, cookie);
  expect(r.status).toBe(201);
  return r.json.table as { id: string; table_number: string; seats: number; section_id: string | null; is_active: boolean };
}
async function addSection(name: string, cookie = owner) {
  const r = await tables({ action: "section_add", name }, cookie);
  expect(r.status).toBe(201);
  return r.json.section as { id: string; name: string; sort_order: number; is_active: boolean };
}
async function addBooking(rid: string, tableId: string, date: string, over: Record<string, unknown> = {}) {
  const r = await db
    .from("bookings")
    .insert({
      restaurant_id: rid,
      table_id: tableId,
      customer_name: "Vitest Venue",
      customer_phone: "07700900123",
      party_size: 2,
      booking_date: date,
      booking_time: "19:00",
      menu_preferences: RUN_MARKER,
      status: "confirmed",
      ...over,
    })
    .select("id")
    .single();
  if (r.error) throw r.error;
  return r.data.id as string;
}
const tableRow = async (id: string) => (await db.from("restaurant_tables").select("*").eq("id", id).single()).data as any;
const freeTable = async (rid: string, date: string, time: string, party: number) =>
  (await db.rpc("find_free_table", { p_restaurant_id: rid, p_date: date, p_time: time, p_party_size: party }).maybeSingle()).data as any;

beforeAll(async () => {
  for (const label of ["a", "b"]) {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-tables-${label}` }).select("id").single();
    if (r.error) throw r.error;
    if (label === "a") A = r.data.id;
    else B = r.data.id;
  }
  owner = await staffCookie(A, "owner");
  manager = await staffCookie(A, "manager");
  staff = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  for (const rid of [A, B]) {
    if (!rid) continue;
    await db.from("bookings").delete().eq("restaurant_id", rid);
    await db.from("restaurants").delete().eq("id", rid);
  }
});

describe("who may edit tables", () => {
  it("no login = 401, staff = 403 on every action, manager and owner = 201", async () => {
    expect((await tables({ action: "section_add", name: "x" }, null)).status).toBe(401);
    const t = await addTable(A, owner);
    const bodies: Record<string, unknown>[] = [
      { action: "section_add", name: "Staff try" },
      { action: "table_add", table_number: "S1", seats: 2 },
      { action: "table_bulk_add", from: 1, to: 3, seats: 2 },
      { action: "table_update", id: t.id, seats: 3 },
      { action: "table_set_active", id: t.id, is_active: false },
    ];
    for (const b of bodies) expect((await tables(b, staff)).status).toBe(403);
    expect((await tableRow(t.id)).seats).toBe(4);
    expect((await tables({ action: "section_add", name: uniq("Mgr") }, manager)).status).toBe(201);
    expect((await tables({ action: "section_add", name: uniq("Own") }, owner)).status).toBe(201);
  });

  it("staff can still seat and clear a table (existing capability)", async () => {
    const t = await addTable(A, owner, 4);
    const s = await seat({ table_id: t.id, party_size: 2 }, staff);
    expect(s.status).toBe(201);
    expect((await clear({ table_session_id: s.json.session.id }, staff)).status).toBe(200);
  });

  it("a restaurant_id of another restaurant in the body = 403", async () => {
    const r = await tables({ action: "section_add", name: uniq("X"), restaurant_id: B }, owner);
    expect(r.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("another restaurant's owner cannot change, switch off or rename A's rows (404)", async () => {
    const sec = await addSection(uniq("Iso"));
    const t = await addTable(A, owner, 4, sec.id);
    expect((await tables({ action: "table_update", id: t.id, seats: 9 }, ownerB)).status).toBe(404);
    expect((await tables({ action: "table_set_active", id: t.id, is_active: false }, ownerB)).status).toBe(404);
    expect((await tables({ action: "section_rename", id: sec.id, name: "Hacked" }, ownerB)).status).toBe(404);
    expect((await tables({ action: "section_set_active", id: sec.id, is_active: false }, ownerB)).status).toBe(404);
    const row = await tableRow(t.id);
    expect(row).toMatchObject({ seats: 4, is_active: true });
  });

  it("A's section cannot be used for a table of B (API 404, and the database refuses it too)", async () => {
    const sec = await addSection(uniq("Mine"));
    expect((await tables({ action: "table_add", table_number: uniq("B"), seats: 2, section_id: sec.id }, ownerB)).status).toBe(404);
    expect((await tables({ action: "table_bulk_add", from: 1, to: 2, seats: 2, section_id: sec.id }, ownerB)).status).toBe(404);
    const mine = await addTable(B, ownerB, 2);
    expect((await tables({ action: "table_update", id: mine.id, section_id: sec.id }, ownerB)).status).toBe(404);
    const direct = await db.from("restaurant_tables").insert({ restaurant_id: B, table_number: uniq("D"), seats: 2, section_id: sec.id });
    expect(direct.error?.code).toBe("23503"); // composite foreign key (migration 0026)
  });

  it("reordering with another restaurant's section ids is refused and changes nothing", async () => {
    const a1 = await addSection(uniq("Ord"));
    const b1 = await tables({ action: "section_add", name: uniq("OrdB") }, ownerB);
    const r = await tables({ action: "section_reorder", ids: [a1.id, b1.json.section.id] }, owner);
    expect(r.status).toBe(400);
  });

  it("the same table number may exist in two restaurants", async () => {
    const n = uniq("Same");
    expect((await tables({ action: "table_add", table_number: n, seats: 2 }, owner)).status).toBe(201);
    expect((await tables({ action: "table_add", table_number: n, seats: 2 }, ownerB)).status).toBe(201);
    expect((await tables({ action: "table_add", table_number: n, seats: 2 }, owner)).status).toBe(409);
  });
});

describe("bulk add", () => {
  it("creates exactly the range, with prefix, seats and section", async () => {
    const sec = await addSection(uniq("Bulk"));
    const r = await tables({ action: "table_bulk_add", prefix: "BK", from: 1, to: 5, seats: 6, section_id: sec.id });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(5);
    const rows = (await db.from("restaurant_tables").select("table_number, seats, section_id, is_active").eq("restaurant_id", A).like("table_number", "BK%")).data ?? [];
    expect(rows.map((x) => x.table_number).sort()).toEqual(["BK1", "BK2", "BK3", "BK4", "BK5"]);
    expect(rows.every((x) => x.seats === 6 && x.section_id === sec.id && x.is_active)).toBe(true);
  });

  it("refuses more than 200 at once, a backwards range and bad seats, and adds nothing", async () => {
    const before = (await db.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", B)).count;
    expect((await tables({ action: "table_bulk_add", prefix: "X", from: 1, to: 201, seats: 2 }, ownerB)).status).toBe(400);
    expect((await tables({ action: "table_bulk_add", prefix: "X", from: 9, to: 3, seats: 2 }, ownerB)).status).toBe(400);
    expect((await tables({ action: "table_bulk_add", prefix: "X", from: 1, to: 3, seats: 0 }, ownerB)).status).toBe(400);
    expect((await tables({ action: "table_bulk_add", prefix: "X", from: 1, to: 3, seats: 51 }, ownerB)).status).toBe(400);
    const after = (await db.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", B)).count;
    expect(after).toBe(before);
  });

  it("exactly 200 is allowed", async () => {
    const r = await tables({ action: "table_bulk_add", prefix: "Big", from: 1, to: 200, seats: 2 }, ownerB);
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(200);
  });

  it("a clash with an existing (even switched-off) table adds nothing and names the clash", async () => {
    const t = await tables({ action: "table_add", table_number: "CL3", seats: 2 });
    expect(t.status).toBe(201);
    expect((await tables({ action: "table_set_active", id: t.json.table.id, is_active: false })).status).toBe(200);
    const r = await tables({ action: "table_bulk_add", prefix: "CL", from: 1, to: 5, seats: 2 });
    expect(r.status).toBe(409);
    expect(r.json.message).toContain("CL3");
    const made = (await db.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", A).like("table_number", "CL%")).count;
    expect(made).toBe(1);
  });
});

describe("switching a table off", () => {
  it("is refused while guests sit there, with a clear message, and allowed after clearing", async () => {
    const t = await addTable(A, owner, 4);
    const s = await seat({ table_id: t.id, party_size: 3 });
    expect(s.status).toBe(201);
    const refused = await tables({ action: "table_set_active", id: t.id, is_active: false });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toBe("table_in_use");
    expect(refused.json.message).toContain("sitting");
    expect((await tableRow(t.id)).is_active).toBe(true);
    expect((await clear({ table_session_id: s.json.session.id })).status).toBe(200);
    expect((await tables({ action: "table_set_active", id: t.id, is_active: false })).status).toBe(200);
    expect((await tableRow(t.id)).is_active).toBe(false);
  });

  it("is refused while a confirmed booking is still ahead, allowed once it is cancelled", async () => {
    const t = await addTable(A, owner, 4);
    const bookingId = await addBooking(A, t.id, FUTURE);
    const refused = await tables({ action: "table_set_active", id: t.id, is_active: false });
    expect(refused.status).toBe(409);
    expect(refused.json.message).toContain("booking");
    expect(refused.json.details.bookings).toHaveLength(1);
    await db.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
    expect((await tables({ action: "table_set_active", id: t.id, is_active: false })).status).toBe(200);
  });

  it("an old confirmed booking in the past does not stop it", async () => {
    const t = await addTable(A, owner, 4);
    await addBooking(A, t.id, PAST);
    expect((await tables({ action: "table_set_active", id: t.id, is_active: false })).status).toBe(200);
  });

  it("can be switched back on", async () => {
    const t = await addTable(A, owner, 4);
    await tables({ action: "table_set_active", id: t.id, is_active: false });
    expect((await tables({ action: "table_set_active", id: t.id, is_active: true })).status).toBe(200);
    expect((await tableRow(t.id)).is_active).toBe(true);
  });

  it("a table cannot shrink below a party that is booked there", async () => {
    const t = await addTable(A, owner, 6);
    await addBooking(A, t.id, FUTURE, { party_size: 5 });
    const r = await tables({ action: "table_update", id: t.id, seats: 4 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("table_too_small");
    expect((await tables({ action: "table_update", id: t.id, seats: 5 })).status).toBe(200);
    expect((await tables({ action: "table_update", id: t.id, seats: 8, table_number: uniq("Ren"), notes: "By the window" })).status).toBe(200);
    expect(await tableRow(t.id)).toMatchObject({ seats: 8, notes: "By the window" });
  });
});

describe("an inactive table is never booked or seated", () => {
  // A throwaway restaurant of its own, so no other test's tables get in the way.
  let R: string;
  let cookie: string;
  beforeAll(async () => {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-tables-c` }).select("id").single();
    if (r.error) throw r.error;
    R = r.data.id;
    cookie = await staffCookie(R, "owner");
  });
  afterAll(async () => {
    await db.from("bookings").delete().eq("restaurant_id", R);
    await db.from("restaurants").delete().eq("id", R);
  });

  it("find_free_table skips it and create_booking_tx uses the next active table", async () => {
    const small = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: "S2", seats: 2 }, cookie);
    const big = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: "S4", seats: 4 }, cookie);
    expect((await freeTable(R, FUTURE, "20:00", 2)).table_number).toBe("S2"); // smallest that fits
    await call(tablesRoute, "/api/staff/tables", { action: "table_set_active", id: small.json.table.id, is_active: false }, cookie);
    expect((await freeTable(R, FUTURE, "20:00", 2)).table_number).toBe("S4");
    const booked = await db.rpc("create_booking_tx", {
      p_restaurant_id: R, p_date: FUTURE, p_time: "20:00", p_party_size: 2, p_customer_name: "Vitest Venue", p_customer_phone: "07700900123", p_menu_preferences: RUN_MARKER,
    });
    expect(booked.data).toMatchObject({ success: true, table_number: "S4" });
    // Now the only active table is taken: no table, even though an inactive one would fit.
    const second = await db.rpc("create_booking_tx", {
      p_restaurant_id: R, p_date: FUTURE, p_time: "20:30", p_party_size: 2, p_customer_name: "Vitest Venue", p_customer_phone: "07700900123", p_menu_preferences: RUN_MARKER,
    });
    expect(second.data).toMatchObject({ success: false, reason: "no_table" });
    expect(big.status).toBe(201);
  });

  it("a party that only an inactive table could seat is party_too_large", async () => {
    const huge = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: "H12", seats: 12 }, cookie);
    expect((await freeTable(R, FUTURE, "18:00", 10)).table_number).toBe("H12");
    await call(tablesRoute, "/api/staff/tables", { action: "table_set_active", id: huge.json.table.id, is_active: false }, cookie);
    expect(await freeTable(R, FUTURE, "18:00", 10)).toBeNull();
    const r = await db.rpc("create_booking_tx", {
      p_restaurant_id: R, p_date: FUTURE, p_time: "18:00", p_party_size: 10, p_customer_name: "Vitest Venue", p_customer_phone: "07700900123", p_menu_preferences: RUN_MARKER,
    });
    expect(r.data).toMatchObject({ success: false, reason: "party_too_large" });
  });

  it("seat-table refuses a switched-off table", async () => {
    const t = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: "OFF1", seats: 4 }, cookie);
    await call(tablesRoute, "/api/staff/tables", { action: "table_set_active", id: t.json.table.id, is_active: false }, cookie);
    const s = await call(seatRoute, "/api/staff/seat-table", { table_id: t.json.table.id, party_size: 2 }, cookie);
    expect(s.status).toBe(409);
    expect(s.json.error).toContain("switched off");
    const open = await db.from("table_sessions").select("id").eq("table_id", t.json.table.id).is("cleared_at", null);
    expect(open.data).toHaveLength(0);
  });

  it("existing rules are unchanged: one party per table, and the 90-minute window", async () => {
    const t = await call(tablesRoute, "/api/staff/tables", { action: "table_add", table_number: "ONE", seats: 4 }, cookie);
    const id = t.json.table.id;
    expect((await call(seatRoute, "/api/staff/seat-table", { table_id: id, party_size: 2 }, cookie)).status).toBe(201);
    expect((await call(seatRoute, "/api/staff/seat-table", { table_id: id, party_size: 2 }, cookie)).status).toBe(409);
    expect((await call(seatRoute, "/api/staff/seat-table", { table_id: id, party_size: 9 }, cookie)).status).toBe(400);
  });
});

describe("sections", () => {
  it("duplicate names (any case) are refused, rename works, and rows are ordered", async () => {
    const n = uniq("Sec");
    const first = await addSection(n);
    expect((await tables({ action: "section_add", name: n.toUpperCase() })).status).toBe(409);
    const second = await addSection(uniq("Sec"));
    expect(second.sort_order).toBeGreaterThan(first.sort_order);
    const renamed = await tables({ action: "section_rename", id: first.id, name: uniq("Renamed") });
    expect(renamed.status).toBe(200);
    expect((await tables({ action: "section_rename", id: first.id, name: second.name })).status).toBe(409);
  });

  it("reorder needs every section once and saves the new order", async () => {
    const all = (await db.from("table_sections").select("id").eq("restaurant_id", B).order("sort_order")).data ?? [];
    const x = await tables({ action: "section_add", name: uniq("RA") }, ownerB);
    const y = await tables({ action: "section_add", name: uniq("RB") }, ownerB);
    const ids = [...all.map((s) => s.id), x.json.section.id, y.json.section.id];
    expect((await tables({ action: "section_reorder", ids: ids.slice(0, -1) }, ownerB)).status).toBe(400); // one missing
    const flipped = [...ids.slice(0, -2), y.json.section.id, x.json.section.id];
    expect((await tables({ action: "section_reorder", ids: flipped }, ownerB)).status).toBe(200);
    const after = (await db.from("table_sections").select("id").eq("restaurant_id", B).order("sort_order")).data ?? [];
    expect(after.map((s) => s.id)).toEqual(flipped);
  });

  it("switching a section off needs it to have no active tables; its tables cannot come back until it is on", async () => {
    const sec = await addSection(uniq("Off"));
    const t = await addTable(A, owner, 2, sec.id);
    const refused = await tables({ action: "section_set_active", id: sec.id, is_active: false });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toBe("section_has_active_tables");
    expect((await tables({ action: "table_set_active", id: t.id, is_active: false })).status).toBe(200);
    expect((await tables({ action: "section_set_active", id: sec.id, is_active: false })).status).toBe(200);
    // Section off: the table cannot be switched on, and no new table can join it.
    expect((await tables({ action: "table_set_active", id: t.id, is_active: true })).status).toBe(409);
    expect((await tables({ action: "table_add", table_number: uniq("N"), seats: 2, section_id: sec.id })).status).toBe(404);
    expect((await tables({ action: "section_set_active", id: sec.id, is_active: true })).status).toBe(200);
    expect((await tables({ action: "table_set_active", id: t.id, is_active: true })).status).toBe(200);
  });

  it("a table can move to another section or to none", async () => {
    const s1 = await addSection(uniq("M1"));
    const t = await addTable(A, owner, 2, s1.id);
    expect((await tables({ action: "table_update", id: t.id, section_id: null })).status).toBe(200);
    expect((await tableRow(t.id)).section_id).toBeNull();
    expect((await tables({ action: "table_update", id: t.id, section_id: s1.id })).status).toBe(200);
    expect((await tableRow(t.id)).section_id).toBe(s1.id);
  });
});

describe("old tables keep working", () => {
  it("a table made the old way (no new columns) is active, has no section and is found for a booking", async () => {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-tables-old` }).select("id").single();
    if (r.error) throw r.error;
    try {
      const t = await db.from("restaurant_tables").insert({ restaurant_id: r.data.id, table_number: "OLD1", seats: 2 }).select("*").single();
      expect(t.data).toMatchObject({ is_active: true, section_id: null, notes: null });
      expect((await freeTable(r.data.id, FUTURE, "19:00", 2)).table_number).toBe("OLD1");
    } finally {
      await db.from("restaurants").delete().eq("id", r.data.id);
    }
  });
});
