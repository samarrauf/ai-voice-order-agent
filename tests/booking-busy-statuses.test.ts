import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as checkAvailability } from "@/app/api/tools/check-availability/route";
import { RID, RUN_MARKER, callTool, db } from "./helpers/helpers";

// Needs migration 0012_booking_busy_statuses.sql (plus 0006, 0008, 0011).
//
// Rule under test: a table is busy for a 90-minute window if it has a
// 'confirmed' or 'seated' booking, or an OPEN table session (cleared_at null)
// seated within that window. cancelled / no_show / completed free the table.
//
// Every test uses the only eight-seater and its own far-future date, so it
// never meets real bookings or other tests.
// Test bookings carry RUN_MARKER in menu_preferences. table_sessions has no
// text column, so test sessions are found by id (this run) or, for leftovers
// of an interrupted run, by a seated_at in 2031 (real sessions never are).

const PARTY = 8;
const sessionIds: string[] = [];
let eightSeaterId: string;

async function cleanup() {
  // Sessions first: they point at bookings. Only this run's marker is touched
  // for bookings, because other test files run in parallel with their own markers.
  if (sessionIds.length) await db.from("table_sessions").delete().in("id", sessionIds);
  await db
    .from("table_sessions")
    .delete()
    .eq("restaurant_id", RID)
    .gte("seated_at", "2031-01-01T00:00:00Z")
    .lt("seated_at", "2032-01-01T00:00:00Z");
  const { error } = await db.from("bookings").delete().like("menu_preferences", `${RUN_MARKER}%`);
  if (error) throw error;
}

beforeAll(async () => {
  await cleanup(); // self-heal after an interrupted run
  const { data } = await db.from("restaurant_tables").select("id").eq("restaurant_id", RID).gte("seats", PARTY);
  expect(data, "expected exactly one eight-seater").toHaveLength(1);
  eightSeaterId = data![0].id;
  const { data: open } = await db.from("table_sessions").select("id").eq("table_id", eightSeaterId).is("cleared_at", null);
  expect(open, "the eight-seater has a real open session right now; clear it and re-run").toHaveLength(0);
});

afterAll(cleanup);

/** Calls the real booking function (same path as create-booking). */
async function rpcBook(date: string, time: string) {
  const { data, error } = await db.rpc("create_booking_tx", {
    p_restaurant_id: RID,
    p_date: date,
    p_time: time,
    p_party_size: PARTY,
    p_customer_name: "Vitest Booker",
    p_customer_phone: "07700900123",
    p_menu_preferences: RUN_MARKER,
  });
  expect(error).toBeNull();
  return data as { success: boolean; reason?: string; booking_reference?: string };
}

async function setStatus(reference: string, status: string) {
  const { error } = await db.from("bookings").update({ status }).eq("booking_reference", reference);
  expect(error).toBeNull();
}

const available = async (date: string, time: string) =>
  (await callTool(checkAvailability, { restaurant_id: RID, date, time, party_size: PARTY })).json.available as boolean;

/** Opens a session on the eight-seater; seatedAt is an ISO instant. */
async function openSession(seatedAt: string, bookingId: string | null = null) {
  const { data, error } = await db
    .from("table_sessions")
    .insert({
      restaurant_id: RID, table_id: eightSeaterId, party_size: 2, booking_id: bookingId,
      source: bookingId ? "booking" : "walk_in", seated_at: seatedAt,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  sessionIds.push(data!.id);
  return data!.id as string;
}

describe("seated bookings block their table", () => {
  it("a seated booking's table cannot be booked again in the same window (RPC and endpoint agree)", async () => {
    const date = "2031-06-02";
    const first = await rpcBook(date, "19:00");
    expect(first.success).toBe(true);
    await setStatus(first.booking_reference!, "seated");

    expect(await available(date, "19:00")).toBe(false);
    expect(await available(date, "20:00")).toBe(false); // still inside its 90 minutes
    const second = await rpcBook(date, "19:30");
    expect(second).toMatchObject({ success: false, reason: "no_table" });

    expect(await available(date, "20:30")).toBe(true); // window over
  });

  it.each(["cancelled", "no_show", "completed"])("a %s booking leaves its table free to book again", async (status) => {
    const date = { cancelled: "2031-06-03", no_show: "2031-06-04", completed: "2031-06-05" }[status]!;
    const first = await rpcBook(date, "19:00");
    expect(first.success).toBe(true);
    expect(await available(date, "19:00")).toBe(false); // confirmed: busy

    await setStatus(first.booking_reference!, status);
    expect(await available(date, "19:00")).toBe(true);
    expect((await rpcBook(date, "19:00")).success).toBe(true);
  });
});

describe("open table sessions block their table", () => {
  it("a walk-in session blocks for 90 minutes from seated_at, and is free once cleared", async () => {
    const date = "2031-01-14"; // winter: London time = UTC
    const sessionId = await openSession(`${date}T19:00:00Z`);

    expect(await available(date, "19:00")).toBe(false);
    expect(await available(date, "18:00")).toBe(false); // would still be there at 19:00
    expect(await available(date, "20:29")).toBe(false);
    expect(await available(date, "20:30")).toBe(true); // session window over
    expect(await available(date, "17:30")).toBe(true); // would leave exactly at 19:00
    expect(await rpcBook(date, "19:30")).toMatchObject({ success: false, reason: "no_table" });

    const { error } = await db.from("table_sessions").update({ cleared_at: new Date().toISOString() }).eq("id", sessionId);
    expect(error).toBeNull();
    expect(await available(date, "19:00")).toBe(true);
    expect((await rpcBook(date, "19:00")).success).toBe(true);
  });

  it("a session from a booking blocks the same way, and is free after clearing", async () => {
    const date = "2031-01-15";
    // A booking on another day, seated at the table on this day.
    const other = await rpcBook("2031-01-20", "12:00");
    const { data: row } = await db.from("bookings").select("id").eq("booking_reference", other.booking_reference!).single();
    const sessionId = await openSession(`${date}T19:00:00Z`, row!.id);

    expect(await available(date, "19:00")).toBe(false);
    await db.from("table_sessions").update({ cleared_at: new Date().toISOString() }).eq("id", sessionId);
    expect(await available(date, "19:00")).toBe(true);
  });

  it("converts seated_at to London time in summer (18:00 UTC is 19:00 in BST)", async () => {
    const date = "2031-07-09";
    await openSession(`${date}T18:00:00Z`);
    expect(await available(date, "19:00")).toBe(false);
    expect(await available(date, "20:29")).toBe(false);
    expect(await available(date, "20:30")).toBe(true);
    expect(await available(date, "17:30")).toBe(true);
  });
});
