import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/check-availability/route";
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
  date: "2031-03-01",
  time: "19:00",
  party_size: 4,
  ...overrides,
});

/** Books a table straight through the database function (same path create-booking uses). */
async function book(date: string, time: string, party: number) {
  const { data, error } = await db.rpc("create_booking_tx", {
    p_restaurant_id: RID,
    p_date: date,
    p_time: time,
    p_party_size: party,
    p_customer_name: "Vitest Booker",
    p_customer_phone: "07700900123",
    p_menu_preferences: RUN_MARKER,
  });
  expect(error).toBeNull();
  expect((data as { success: boolean }).success).toBe(true);
}

describe("check-availability", () => {
  it("rejects a missing or wrong secret", async () => {
    expect((await callTool(POST, body(), null)).status).toBe(401);
    expect((await callTool(POST, body(), "wrong-secret")).status).toBe(401);
  });

  it("says yes for a free table and reads the date and time as words", async () => {
    const { status, json } = await callTool(POST, body({ date: "2031-03-02", time: "19:30" }));
    expect(status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.speech).toContain("four people");
    expect(json.speech).toContain("half past seven");
    expect(json.speech).not.toMatch(/\d/);
  });

  it("says no when every big-enough table is taken (the only eight-seater)", async () => {
    await book("2031-03-03", "19:00", 8);
    const { status, json } = await callTool(POST, body({ date: "2031-03-03", time: "19:00", party_size: 8 }));
    expect(status).toBe(200);
    expect(json.available).toBe(false);
    expect(json.speech).toMatch(/don't have a table/);
  });

  it("a booking blocks its table for 90 minutes, then it is free again", async () => {
    await book("2031-03-04", "19:00", 8);
    const at = (time: string) => callTool(POST, body({ date: "2031-03-04", time, party_size: 8 }));
    expect((await at("18:00")).json.available).toBe(false); // would still be seated at 19:00
    expect((await at("20:29")).json.available).toBe(false); // 19:00 booking runs until 20:30
    expect((await at("20:30")).json.available).toBe(true);
    expect((await at("17:30")).json.available).toBe(true); // would finish exactly at 19:00
  });

  it.each(["03:00", "15:00"])("says no with reason 'closed' when the restaurant is shut at %s, even though every table is free", async (time) => {
    const { status, json } = await callTool(POST, body({ date: "2031-03-06", time }));
    expect(status).toBe(200);
    expect(json.available).toBe(false);
    expect(json.reason).toBe("closed");
    expect(json.speech).toMatch(/closed/i);
  });

  it("returns 404 for a restaurant that does not exist", async () => {
    const { status } = await callTool(POST, body({ restaurant_id: "99999999-9999-9999-9999-999999999999" }));
    expect(status).toBe(404);
  });

  it("says no for a party bigger than any table", async () => {
    const { json } = await callTool(POST, body({ date: "2031-03-05", party_size: 9 }));
    expect(json.available).toBe(false);
  });

  it.each([
    ["bad date", { date: "2031-02-31" }],
    ["bad time", { time: "25:00" }],
    ["zero people", { party_size: 0 }],
    ["party as text", { party_size: "four" }],
    ["no restaurant", { restaurant_id: undefined }],
  ])("returns 400 with something to say for %s", async (_label, overrides) => {
    const { status, json } = await callTool(POST, body(overrides));
    expect(status).toBe(400);
    expect(json.speech).toMatch(/Sorry/);
  });
});
