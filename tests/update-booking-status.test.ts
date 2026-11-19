import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as updateStatus } from "@/app/api/staff/update-booking-status/route";
import { SESSION_COOKIE } from "@/lib/session";
import { RID, RUN_MARKER, db, sessionToken } from "./helpers/helpers";

// Staff route, called like the dashboard would: with the login cookie (or without
// it, to prove it refuses). Needs migration 0011_booking_statuses.sql applied.
// Every row made here carries RUN_MARKER ("vitest-run-..."), so the self-heal in
// tests/helpers/global-setup.ts can remove leftovers of an interrupted run.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function call(body: unknown, cookie: string | null | undefined = undefined) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== null) headers.cookie = `${SESSION_COOKIE}=${cookie ?? sessionToken()}`;
  const res = await updateStatus(
    new Request("http://localhost/api/staff/update-booking-status", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const statusInDb = async (id: string) => (await db.from("bookings").select("status").eq("id", id).single()).data?.status;

let otherRestaurantId: string;
let tableId: string;

/** A throwaway booking, in the demo restaurant unless told otherwise. */
async function makeBooking(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from("bookings")
    .insert({
      restaurant_id: RID,
      table_id: tableId,
      customer_name: "Vitest Status",
      customer_phone: "07700900123",
      party_size: 2,
      booking_date: "2031-06-01",
      booking_time: "19:00",
      menu_preferences: RUN_MARKER,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  // A table of our own, so seating never touches a real table in the dining room.
  const table = await db
    .from("restaurant_tables")
    .insert({ restaurant_id: RID, table_number: RUN_MARKER, seats: 4 })
    .select("id")
    .single();
  if (table.error) throw table.error;
  tableId = table.data.id;

  const other = await db.from("restaurants").insert({ name: RUN_MARKER }).select("id").single();
  if (other.error) throw other.error;
  otherRestaurantId = other.data.id;
});

afterAll(async () => {
  // Bookings first (a restaurant can't be deleted while it has bookings); deleting
  // the table also removes its seating sessions.
  const b = await db.from("bookings").delete().like("menu_preferences", `${RUN_MARKER}%`);
  const t = await db.from("restaurant_tables").delete().like("table_number", `${RUN_MARKER}%`);
  const r = await db.from("restaurants").delete().like("name", `${RUN_MARKER}%`);
  for (const res of [b, t, r]) if (res.error) throw res.error;
});

describe("POST /api/staff/update-booking-status", () => {
  it("refuses without a login (401) and changes nothing", async () => {
    const id = await makeBooking();
    expect((await call({ booking_id: id, status: "cancelled" }, null)).status).toBe(401);
    expect((await call({ booking_id: id, status: "cancelled" }, "123.bad")).status).toBe(401);
    expect(await statusInDb(id)).toBe("confirmed");
  });

  it("rejects an invalid status or id (400)", async () => {
    const id = await makeBooking();
    for (const status of ["banana", "confirmed", "", 5, undefined]) {
      expect((await call({ booking_id: id, status })).status).toBe(400);
    }
    expect((await call({ status: "cancelled" })).status).toBe(400);
    expect((await call({ booking_id: "not-an-id", status: "cancelled" })).status).toBe(400);
    expect(await statusInDb(id)).toBe("confirmed");
  });

  it("returns 404 for a booking that does not exist", async () => {
    const r = await call({ booking_id: "99999999-9999-9999-9999-999999999999", status: "cancelled" });
    expect(r.status).toBe(404);
  });

  it("refuses a wrong move: cancelled can't become confirmed or anything else", async () => {
    const id = await makeBooking({ status: "cancelled" });
    expect((await call({ booking_id: id, status: "confirmed" })).status).toBe(400); // not an accepted target at all
    for (const status of ["seated", "completed", "no_show", "cancelled"]) {
      const r = await call({ booking_id: id, status });
      expect(r.status).toBe(409);
      expect(r.json.success).toBe(false);
    }
    expect(await statusInDb(id)).toBe("cancelled");
  });

  it("refuses other wrong moves: completed is final, a confirmed booking can't jump to completed", async () => {
    const done = await makeBooking({ status: "completed" });
    expect((await call({ booking_id: done, status: "cancelled" })).status).toBe(409);
    expect(await statusInDb(done)).toBe("completed");

    const fresh = await makeBooking();
    expect((await call({ booking_id: fresh, status: "completed" })).status).toBe(409);
    expect(await statusInDb(fresh)).toBe("confirmed");
  });

  it("cancels and marks no-show a confirmed booking", async () => {
    const a = await makeBooking();
    const r = await call({ booking_id: a, status: "cancelled" });
    expect(r.status).toBe(200);
    expect(r.json.booking.status).toBe("cancelled");
    expect(await statusInDb(a)).toBe("cancelled");

    const b = await makeBooking();
    expect((await call({ booking_id: b, status: "no_show" })).status).toBe(200);
    expect(await statusInDb(b)).toBe("no_show");
  });

  it("only seats a booking that really has an open table session, then completes it", async () => {
    const id = await makeBooking();
    // No table session yet: refused.
    expect((await call({ booking_id: id, status: "seated" })).status).toBe(409);
    expect(await statusInDb(id)).toBe("confirmed");

    const session = await db
      .from("table_sessions")
      .insert({ restaurant_id: RID, table_id: tableId, booking_id: id, party_size: 2, source: "booking" })
      .select("id")
      .single();
    expect(session.error).toBeNull();

    const seated = await call({ booking_id: id, status: "seated" });
    expect(seated.status).toBe(200);
    expect(await statusInDb(id)).toBe("seated");

    // A seated party can't be cancelled or marked no-show, only completed.
    expect((await call({ booking_id: id, status: "cancelled" })).status).toBe(409);
    expect((await call({ booking_id: id, status: "no_show" })).status).toBe(409);

    const completed = await call({ booking_id: id, status: "completed" });
    expect(completed.status).toBe(200);
    expect(await statusInDb(id)).toBe("completed");
  });

  it("can't change a booking of another restaurant (404) and leaves it untouched", async () => {
    const id = await makeBooking({ restaurant_id: otherRestaurantId, table_id: null });
    for (const status of ["cancelled", "no_show", "seated", "completed"]) {
      expect((await call({ booking_id: id, status })).status).toBe(404);
    }
    expect(await statusInDb(id)).toBe("confirmed");
  });
});
