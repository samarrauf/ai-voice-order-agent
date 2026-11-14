import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/create-booking/route";
import { RID, RUN_MARKER, callTool, db } from "./helpers/helpers";

// DOUBLE-BOOKING RACE: several callers book at the same moment. The database
// function must hand each table out only once. Needs 0006_bookings.sql and
// seed_tables.sql applied to the Supabase project.

afterAll(async () => {
  const { error } = await db.from("bookings").delete().like("menu_preferences", `${RUN_MARKER}%`);
  if (error) throw error;
});

const body = (overrides: Record<string, unknown> = {}) => ({
  restaurant_id: RID,
  date: "2031-05-01",
  time: "19:00",
  party_size: 8,
  customer_name: "Race Booker",
  customer_phone: "07700900123",
  menu_preferences: RUN_MARKER,
  ...overrides,
});

describe("double-booking race condition", () => {
  it("two requests for the only eight-seater at the same moment: exactly one succeeds", async () => {
    const date = "2031-05-01";
    const [a, b] = await Promise.all([
      callTool(POST, body({ date, customer_name: "Racer One" })),
      callTool(POST, body({ date, customer_name: "Racer Two" })),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.json.reason).toBe("no_table"); // a clear "no space", not a 500

    const { data } = await db
      .from("bookings")
      .select("id")
      .eq("restaurant_id", RID)
      .eq("booking_date", date)
      .eq("status", "confirmed")
      .like("menu_preferences", `${RUN_MARKER}%`);
    expect(data).toHaveLength(1);
  });

  it("ten simultaneous requests for a party of six: exactly three succeed (three tables seat six or more), each on a different table", async () => {
    const date = "2031-05-02";
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => callTool(POST, body({ date, party_size: 6, customer_name: `Racer ${i}` }))),
    );

    const ok = results.filter((r) => r.status === 200);
    const full = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(full).toHaveLength(7);
    expect(results.filter((r) => r.status !== 200 && r.status !== 409)).toHaveLength(0); // no 500s

    const tables = ok.map((r) => r.json.table_number);
    expect(new Set(tables).size).toBe(3);
    expect([...tables].sort()).toEqual(["T10", "T11", "T12"]);

    // Database agrees: no table has two confirmed bookings in the same window.
    const { data } = await db
      .from("bookings")
      .select("table_id")
      .eq("restaurant_id", RID)
      .eq("booking_date", date)
      .eq("status", "confirmed")
      .like("menu_preferences", `${RUN_MARKER}%`);
    expect(data).toHaveLength(3);
    expect(new Set(data!.map((r) => r.table_id)).size).toBe(3);
  });

  it("overlapping (not identical) times also cannot share a table", async () => {
    const date = "2031-05-03";
    const times = ["19:00", "19:30", "20:00", "20:29"]; // all within 90 minutes of each other
    const results = await Promise.all(
      times.map((time, i) => callTool(POST, body({ date, time, customer_name: `Overlap ${i}` }))),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });
});
