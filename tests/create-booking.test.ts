import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/create-booking/route";
import { RID, RUN_MARKER, callTool, db } from "./helpers/helpers";

// Needs 0006_bookings.sql and seed_tables.sql applied to the Supabase project.
// Each test uses its own far-future date, so tests never see each other's bookings.
// Rows the tests create carry RUN_MARKER in menu_preferences and are deleted afterwards.

afterAll(async () => {
  const { error } = await db.from("bookings").delete().like("menu_preferences", `${RUN_MARKER}%`);
  if (error) throw error;
});

const body = (overrides: Record<string, unknown> = {}) => ({
  restaurant_id: RID,
  date: "2031-04-01",
  time: "19:00",
  party_size: 2,
  customer_name: "Vitest Booker",
  customer_phone: "07700900123",
  menu_preferences: RUN_MARKER,
  ...overrides,
});

const savedCount = async (date: string, name?: string) => {
  let q = db.from("bookings").select("id", { count: "exact", head: true }).eq("restaurant_id", RID).eq("booking_date", date);
  if (name) q = q.eq("customer_name", name);
  const { count } = await q.like("menu_preferences", `${RUN_MARKER}%`);
  return count;
};

describe("create-booking", () => {
  it("rejects a missing or wrong secret and saves nothing", async () => {
    const date = "2031-04-02";
    expect((await callTool(POST, body({ date }), null)).status).toBe(401);
    expect((await callTool(POST, body({ date }), "wrong-secret")).status).toBe(401);
    expect(await savedCount(date)).toBe(0);
  });

  it("books the smallest table that fits and returns what the agent reads out", async () => {
    const date = "2031-04-03";
    const { status, json } = await callTool(POST, body({ date, party_size: 2 }));
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.booking_reference).toMatch(/^B-\d+$/);
    expect(json.table_number).toBe("T1"); // smallest (two-seater) table, first by number
    expect(json.booking_date).toBe(date);
    expect(json.booking_time).toBe("19:00");
    expect(json.speech).toContain("two people");
    expect(json.speech).not.toMatch(/£/);

    const { data } = await db
      .from("bookings")
      .select("booking_reference, status, party_size, customer_phone, restaurant_tables(table_number, seats)")
      .eq("booking_reference", json.booking_reference)
      .single();
    expect(data).toMatchObject({ status: "confirmed", party_size: 2, customer_phone: "07700900123" });
  });

  it("gives a party of three a four-seater, not a two-seater", async () => {
    const { json } = await callTool(POST, body({ date: "2031-04-04", party_size: 3 }));
    expect(json.table_number).toBe("T5");
  });

  it("a second booking at the same time gets a different table", async () => {
    const date = "2031-04-05";
    const a = await callTool(POST, body({ date, party_size: 2, customer_name: "First Booker" }));
    const b = await callTool(POST, body({ date, party_size: 2, customer_name: "Second Booker" }));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.table_number).toBe("T1");
    expect(b.json.table_number).toBe("T2");
    expect(a.json.booking_reference).not.toBe(b.json.booking_reference);
  });

  it("returns 409 with a clear message when nothing is free, and saves nothing", async () => {
    const date = "2031-04-06";
    expect((await callTool(POST, body({ date, party_size: 8 }))).status).toBe(200); // the only eight-seater
    const { status, json } = await callTool(POST, body({ date, party_size: 8, customer_name: "Too Late" }));
    expect(status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.reason).toBe("no_table");
    expect(json.speech).toMatch(/don't have a table/);
    expect(await savedCount(date, "Too Late")).toBe(0);
  });

  it("the 90-minute window: 20:29 clashes with a 19:00 booking, 20:30 does not", async () => {
    const date = "2031-04-07";
    await callTool(POST, body({ date, time: "19:00", party_size: 8 }));
    expect((await callTool(POST, body({ date, time: "20:29", party_size: 8 }))).status).toBe(409);
    expect((await callTool(POST, body({ date, time: "20:30", party_size: 8 }))).status).toBe(200);
  });

  it.each(["03:00", "15:00"])("refuses a booking at %s when the restaurant is closed: 409 'closed', nothing saved", async (time) => {
    const date = "2031-04-13";
    const { status, json } = await callTool(POST, body({ date, time }));
    expect(status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.available).toBe(false);
    expect(json.reason).toBe("closed");
    expect(json.speech).toMatch(/closed/i);
    expect(await savedCount(date)).toBe(0);
  });

  it("returns 409 party_too_large for a party no table can seat", async () => {
    const { status, json } = await callTool(POST, body({ date: "2031-04-08", party_size: 9 }));
    expect(status).toBe(409);
    expect(json.reason).toBe("party_too_large");
  });

  it("a cancelled booking frees its table", async () => {
    const date = "2031-04-09";
    const first = await callTool(POST, body({ date, party_size: 8 }));
    await db.from("bookings").update({ status: "cancelled" }).eq("booking_reference", first.json.booking_reference);
    expect((await callTool(POST, body({ date, party_size: 8 }))).status).toBe(200);
  });

  // JUNK GUARD: same rule as request-callback, shared helper.
  it.each(["Unknown", "Caller", "N/A", "  ", "123"])(
    "rejects placeholder name %j, asks for the name, saves nothing",
    async (name) => {
      const date = "2031-04-10";
      const { status, json } = await callTool(POST, body({ date, customer_name: name }));
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.speech).toMatch(/name/i);
      expect(await savedCount(date)).toBe(0);
    },
  );

  it.each(["0000000000", "0", "", "12345"])(
    "rejects placeholder phone %j, asks for a number, saves nothing",
    async (phone) => {
      const date = "2031-04-11";
      const { status, json } = await callTool(POST, body({ date, customer_phone: phone }));
      expect(status).toBe(400);
      expect(json.speech).toMatch(/number/i);
      expect(await savedCount(date)).toBe(0);
    },
  );

  it("ignores extra fields like a table number sent by the agent", async () => {
    const { json } = await callTool(POST, body({ date: "2031-04-12", party_size: 2, table_number: "T12", table_id: "x" }));
    expect(json.table_number).toBe("T1");
  });
});
