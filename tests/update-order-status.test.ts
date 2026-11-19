import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as updateStatus } from "@/app/api/staff/update-order-status/route";
import { SESSION_COOKIE } from "@/lib/session";
import { RID, RUN_MARKER, cleanupTestOrders, db, sessionToken } from "./helpers/helpers";

// Staff route, called like the dashboard would: with the login cookie
// (or without it, to prove it refuses). Uses one throwaway order.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function call(body: unknown, cookie: string | null | undefined = undefined) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== null) headers.cookie = `${SESSION_COOKIE}=${cookie ?? sessionToken()}`;
  const res = await updateStatus(
    new Request("http://localhost/api/staff/update-order-status", { method: "POST", headers, body: JSON.stringify({ restaurant_id: RID, ...(body as object) }) }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const statusInDb = async (id: string) => (await db.from("orders").select("status").eq("id", id).single()).data?.status;

let orderId: string;

// A throwaway order in the demo restaurant, marked so cleanup removes it.
async function makeOrder(status: string) {
  const { data, error } = await db
    .from("orders")
    .insert({ restaurant_id: RID, fulfilment_type: "pickup", subtotal: 1, total: 1, status, notes: RUN_MARKER })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  const { data, error } = await db
    .from("orders")
    .insert({ restaurant_id: RID, fulfilment_type: "pickup", subtotal: 1, total: 1, notes: RUN_MARKER })
    .select("id")
    .single();
  if (error) throw error;
  orderId = data.id;
});

afterAll(cleanupTestOrders);

describe("POST /api/staff/update-order-status", () => {
  it("refuses without a login (401) and changes nothing", async () => {
    const r = await call({ order_id: orderId, status: "preparing" }, null);
    expect(r.status).toBe(401);
    expect(await statusInDb(orderId)).toBe("new");
  });

  it("refuses a forged login cookie (401)", async () => {
    expect((await call({ order_id: orderId, status: "preparing" }, "123.bad")).status).toBe(401);
  });

  it("rejects an invalid status (400)", async () => {
    for (const status of ["banana", "cancelled", "", 5]) {
      expect((await call({ order_id: orderId, status })).status).toBe(400);
    }
    expect(await statusInDb(orderId)).toBe("new");
  });

  it("rejects a missing or malformed order_id (400)", async () => {
    expect((await call({ status: "ready" })).status).toBe(400);
    expect((await call({ order_id: "not-an-id", status: "ready" })).status).toBe(400);
  });

  it("returns 404 for an order that does not exist", async () => {
    expect((await call({ order_id: "99999999-9999-9999-9999-999999999999", status: "ready" })).status).toBe(404);
  });

  it("moves the order through new -> preparing -> ready -> completed", async () => {
    for (const status of ["preparing", "ready", "completed"]) {
      const r = await call({ order_id: orderId, status });
      expect(r.status).toBe(200);
      expect(r.json.success).toBe(true);
      expect(r.json.order.status).toBe(status);
      expect(await statusInDb(orderId)).toBe(status);
    }
  });

  it("refuses to change the status of another restaurant's order (404) and changes nothing", async () => {
    const id = await makeOrder("new");
    // P8a: the restaurant comes from the login, so this is a login of another restaurant.
    const other = "22222222-2222-4222-8222-222222222222";
    const r = await call({ restaurant_id: other, order_id: id, status: "preparing" }, sessionToken(other));
    expect(r.status).toBe(404);
    expect(await statusInDb(id)).toBe("new");
  });

  // P8a: restaurant_id in the body is no longer needed (the login decides), so a
  // body without it works for the login's own restaurant. (Was: "requires restaurant_id (400)".)
  it("works without restaurant_id in the body: the login decides the restaurant", async () => {
    const id = await makeOrder("new");
    const r = await call({ restaurant_id: undefined, order_id: id, status: "preparing" });
    expect(r.status).toBe(200);
    expect(await statusInDb(id)).toBe("preparing");
  });

  it.each(["completed", "cancelled"])("cannot reopen a %s order (409)", async (finalStatus) => {
    const id = await makeOrder(finalStatus);
    for (const status of ["new", "preparing", "ready"]) {
      const r = await call({ order_id: id, status });
      expect(r.status).toBe(409);
      expect(r.json.success).toBe(false);
    }
    expect(await statusInDb(id)).toBe(finalStatus);
  });
});
