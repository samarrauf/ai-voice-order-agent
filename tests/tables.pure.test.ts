import { describe, expect, it } from "vitest";
import {
  MAX_BULK,
  bulkNumbers,
  compareTableNumbers,
  durationLabel,
  isUpcomingBooking,
  liveState,
  minutesSince,
  minutesUntil,
  restaurantNow,
  tableActionSchema,
} from "@/lib/tables";

// Network-free: validation limits and the clock / status rules of the Tables page.

const ID = "11111111-1111-1111-1111-111111111111";
const bulk = (over: Record<string, unknown> = {}) => tableActionSchema.safeParse({ action: "table_bulk_add", from: 1, to: 10, seats: 2, ...over });

describe("bulk add limits", () => {
  it("accepts 1..200 and refuses 201 or more tables", () => {
    expect(bulk({ from: 1, to: 200 }).success).toBe(true);
    expect(bulk({ from: 1, to: 201 }).success).toBe(false);
    expect(bulk({ from: 5, to: 4 }).success).toBe(false);
    expect(bulk({ from: 0 }).success).toBe(false);
    expect(bulk({ from: 1, to: 10_000 }).success).toBe(false);
    expect(bulk({ from: 9800, to: 9800 + MAX_BULK - 1 }).success).toBe(true);
  });
  it("seats must be 1..50 and a whole number", () => {
    expect(bulk({ seats: 0 }).success).toBe(false);
    expect(bulk({ seats: 51 }).success).toBe(false);
    expect(bulk({ seats: 2.5 }).success).toBe(false);
    expect(bulk({ seats: 50 }).success).toBe(true);
  });
  it("builds the numbers with the prefix", () => {
    expect(bulkNumbers("", 1, 3)).toEqual(["1", "2", "3"]);
    expect(bulkNumbers("T", 8, 10)).toEqual(["T8", "T9", "T10"]);
  });
});

describe("table and section fields", () => {
  it("trims names and turns an empty note into null", () => {
    const r = tableActionSchema.parse({ action: "table_add", table_number: "  T1 ", seats: 4, notes: "  " });
    expect(r).toMatchObject({ table_number: "T1", notes: null });
  });
  it("refuses empty, too long or control-character names", () => {
    expect(tableActionSchema.safeParse({ action: "table_add", table_number: "  ", seats: 2 }).success).toBe(false);
    expect(tableActionSchema.safeParse({ action: "table_add", table_number: "x".repeat(21), seats: 2 }).success).toBe(false);
    expect(tableActionSchema.safeParse({ action: "table_add", table_number: "a\nb", seats: 2 }).success).toBe(false);
    expect(tableActionSchema.safeParse({ action: "section_add", name: "y".repeat(41) }).success).toBe(false);
  });
  it("section_id may be null (no section) but not a made-up id", () => {
    expect(tableActionSchema.safeParse({ action: "table_update", id: ID, section_id: null }).success).toBe(true);
    expect(tableActionSchema.safeParse({ action: "table_update", id: ID, section_id: "nope" }).success).toBe(false);
  });
  it("unknown actions are refused", () => {
    expect(tableActionSchema.safeParse({ action: "table_delete", id: ID }).success).toBe(false);
  });
});

describe("restaurant clock and bookings", () => {
  // 2031-07-01 12:30 UTC is 13:30 in London (summer time).
  const now = new Date("2031-07-01T12:30:00Z");
  it("reads the local date and minutes in the restaurant's timezone", () => {
    expect(restaurantNow("Europe/London", now)).toEqual({ date: "2031-07-01", minutes: 13 * 60 + 30 });
    expect(restaurantNow("Asia/Karachi", new Date("2031-07-01T20:30:00Z"))).toEqual({ date: "2031-07-02", minutes: 60 + 30 });
    expect(restaurantNow("Not/AZone", now).date).toBe("2031-07-01"); // falls back to London
  });
  const local = { date: "2031-07-01", minutes: 13 * 60 + 30 };
  it("counts minutes until a booking, across days", () => {
    expect(minutesUntil({ booking_date: "2031-07-01", booking_time: "14:00:00" }, local)).toBe(30);
    expect(minutesUntil({ booking_date: "2031-07-02", booking_time: "00:00" }, local)).toBe(630);
    expect(minutesUntil({ booking_date: "2031-07-01", booking_time: "13:00" }, local)).toBe(-30);
  });
  it("a booking still holds its table for 90 minutes, then it no longer counts as upcoming", () => {
    expect(isUpcomingBooking({ booking_date: "2031-07-01", booking_time: "12:30" }, local)).toBe(true); // 60 min in
    expect(isUpcomingBooking({ booking_date: "2031-07-01", booking_time: "12:00" }, local)).toBe(false); // 90 min in
    expect(isUpcomingBooking({ booking_date: "2031-06-30", booking_time: "23:00" }, local)).toBe(false);
    expect(isUpcomingBooking({ booking_date: "2031-07-03", booking_time: "19:00" }, local)).toBe(true);
  });
});

describe("live state", () => {
  const local = { date: "2031-07-01", minutes: 18 * 60 };
  const soon = { booking_date: "2031-07-01", booking_time: "18:45" };
  const later = { booking_date: "2031-07-01", booking_time: "21:00" };
  it("seated beats reserved beats free", () => {
    expect(liveState({ session: { seatedAt: "x" }, nextBooking: soon }, local)).toBe("seated");
    expect(liveState({ session: null, nextBooking: soon }, local)).toBe("reserved");
    expect(liveState({ session: null, nextBooking: later }, local)).toBe("free");
    expect(liveState({ session: null, nextBooking: null }, local)).toBe("free");
  });
  it("a booking that is a little late is still reserved", () => {
    expect(liveState({ session: null, nextBooking: { booking_date: "2031-07-01", booking_time: "17:50" } }, local)).toBe("reserved");
  });
});

describe("labels", () => {
  it("duration and minutes since", () => {
    expect(durationLabel(5)).toBe("5 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(75)).toBe("1 h 15 min");
    expect(minutesSince("2031-07-01T12:00:00Z", new Date("2031-07-01T12:45:30Z"))).toBe(45);
    expect(minutesSince("2031-07-01T13:00:00Z", new Date("2031-07-01T12:45:30Z"))).toBe(0);
  });
  it("table names sort naturally", () => {
    expect(["T10", "T2", "T1"].sort(compareTableNumbers)).toEqual(["T1", "T2", "T10"]);
  });
});
