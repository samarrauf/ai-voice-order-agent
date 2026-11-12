import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as restaurantStatus } from "@/app/api/tools/restaurant-status/route";
import { clockForSpeech, nextOpening, resolveRequestedTime, type OpeningHours } from "@/lib/opening-hours";
import { ITEMS, RID, RUN_MARKER, callTool, cleanupTestOrders, db, orderBody, useOpenClock, useRealClock } from "./helpers/helpers";

// Wednesday 11 Nov 2026, 10:00 London (GMT = UTC in November).
// The seeded hours open Wednesday at 16:00, so the restaurant is CLOSED.
function useClosedClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
}

// A collection order big enough to never hit a minimum.
const pickup = (overrides: Record<string, unknown> = {}) =>
  orderBody({
    fulfilment_type: "pickup",
    delivery_address: null,
    delivery_postcode: null,
    items: [{ menu_item_id: ITEMS.pepperoni, size_name: "12 inch", quantity: 1, options: [] }],
    ...overrides,
  });

afterEach(() => {
  useRealClock();
});
afterAll(cleanupTestOrders);

describe("restaurant-status", () => {
  it("when closed: says when we next open and offers a pre-order", async () => {
    useClosedClock();
    const { status, json } = await callTool(restaurantStatus, { restaurant_id: RID });
    expect(status).toBe(200);
    expect(json.is_open).toBe(false);
    expect(json.accepting_orders).toBe(true);
    expect(json.next_open).toBe("2026-11-11T16:00:00.000Z");
    expect(json.next_open_spoken).toBe("four o'clock");
    expect(json.speech).toMatch(/closed/i);
    expect(json.speech).toContain("four o'clock");
    expect(json.speech).toMatch(/order for then/i);
  });

  it("when open: no speech, so the agent just greets normally", async () => {
    useOpenClock();
    const { json } = await callTool(restaurantStatus, { restaurant_id: RID });
    expect(json.is_open).toBe(true);
    expect(json.next_open).toBeNull();
    expect(json.speech).toBeNull();
  });

  it("rejects a request without the tool secret", async () => {
    const { status } = await callTool(restaurantStatus, { restaurant_id: RID }, null);
    expect(status).toBe(401);
  });
});

describe("create-order pre-orders", () => {
  it("closed + valid requested_time: accepted, stored, and says when it'll be ready", async () => {
    useClosedClock();
    const marker = `${RUN_MARKER}-preorder-ok`;
    const { status, json } = await callTool(createOrder, pickup({ requested_time: "16:15", notes: marker }));
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.requested_time).toBe("2026-11-11T16:15:00+00:00");
    expect(json.speech).toContain("ready for quarter past four");

    const { data } = await db.from("orders").select("requested_time").eq("notes", marker).single();
    expect(new Date(data!.requested_time).toISOString()).toBe("2026-11-11T16:15:00.000Z");
  });

  it("closed + preview with a valid time: the read-back includes the time", async () => {
    useClosedClock();
    const { status, json } = await callTool(createOrder, pickup({ preview: true, requested_time: "16:15" }));
    expect(status).toBe(200);
    expect(json.speech).toContain("for collection for quarter past four");
  });

  it("closed + requested_time before opening: rejected, naming the earliest time", async () => {
    useClosedClock();
    const marker = `${RUN_MARKER}-preorder-early`;
    const { status, json } = await callTool(createOrder, pickup({ requested_time: "15:00", notes: marker }));
    expect(status).toBe(400);
    expect(json.speech).toMatch(/earliest/i);
    expect(json.speech).toContain("four o'clock");
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("notes", marker);
    expect(count).toBe(0);
  });

  it("closed + no requested_time: rejected with a pre-order offer", async () => {
    useClosedClock();
    const { status, json } = await callTool(createOrder, pickup());
    expect(status).toBe(400);
    expect(json.speech).toMatch(/closed/i);
    expect(json.speech).toContain("four o'clock");
    expect(json.speech).toMatch(/order for then/i);
  });

  it("open + no requested_time: unchanged, placed for as soon as possible", async () => {
    useOpenClock();
    const { status, json } = await callTool(createOrder, pickup());
    expect(status).toBe(200);
    expect(json.requested_time).toBeNull();
    expect(json.speech).toContain("ready to collect in about");
  });

  it("owner has switched orders off: a valid pre-order is still rejected", async () => {
    useClosedClock();
    await db.from("restaurants").update({ is_accepting_orders: false }).eq("id", RID);
    try {
      const { status, json } = await callTool(createOrder, pickup({ requested_time: "16:15" }));
      expect(status).toBe(400);
      expect(json.speech).toMatch(/not taking any orders/i);
    } finally {
      await db.from("restaurants").update({ is_accepting_orders: true }).eq("id", RID);
    }
  });
});

describe("opening-time maths", () => {
  const hours: OpeningHours = { wed: [{ open: "16:00", close: "23:00" }], thu: [{ open: "16:00", close: "23:00" }] };

  it("summer time: 16:00 London in July is 15:00 UTC", () => {
    const next = nextOpening(hours, "Europe/London", new Date("2026-07-15T09:00:00Z")); // Wed 10:00 BST
    expect(next!.at.toISOString()).toBe("2026-07-15T15:00:00.000Z");
    expect(next!.spoken).toBe("four o'clock");
  });

  it("after closing, the next opening is tomorrow", () => {
    const next = nextOpening(hours, "Europe/London", new Date("2026-11-11T23:30:00Z")); // Wed 23:30
    expect(next!.at.toISOString()).toBe("2026-11-12T16:00:00.000Z");
    expect(next!.spoken).toBe("tomorrow at four o'clock");
  });

  it("a requested time already passed today means tomorrow", () => {
    const r = resolveRequestedTime("16:15", "Europe/London", new Date("2026-11-11T23:30:00Z"));
    expect(r.at.toISOString()).toBe("2026-11-12T16:15:00.000Z");
    expect(r.spoken).toBe("tomorrow at quarter past four");
  });

  it("speaks clock times naturally", () => {
    expect(clockForSpeech("16:00")).toBe("four o'clock");
    expect(clockForSpeech("16:15")).toBe("quarter past four");
    expect(clockForSpeech("16:30")).toBe("half past four");
    expect(clockForSpeech("16:45")).toBe("quarter to five");
    expect(clockForSpeech("16:20")).toBe("four twenty");
  });
});
