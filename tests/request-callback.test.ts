import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/request-callback/route";
import { RID, RUN_MARKER, callTool, db } from "./helpers/helpers";

// Every row this run creates carries RUN_MARKER in `details`, so cleanup
// deletes only test rows.
afterAll(async () => {
  const { error } = await db.from("callback_requests").delete().like("details", `${RUN_MARKER}%`);
  if (error) throw error;
});

const body = (overrides: Record<string, unknown> = {}) => ({
  restaurant_id: RID,
  customer_name: "Vitest Caller",
  customer_phone: "07700900123",
  reason: "allergen",
  details: `${RUN_MARKER} asked if garlic bread contains nuts`,
  ...overrides,
});

describe("request-callback", () => {
  it("saves exactly one pending callback and thanks the caller by first name", async () => {
    const { status, json } = await callTool(POST, body());
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.speech).toContain("Vitest");

    const { data } = await db
      .from("callback_requests")
      .select("customer_phone, reason, status")
      .eq("details", body().details);
    expect(data).toHaveLength(1);
    expect(data![0]).toEqual({ customer_phone: "07700900123", reason: "allergen", status: "pending" });
  });

  it("a missing phone number asks for one and saves nothing", async () => {
    const marker = `${RUN_MARKER}-nophone`;
    const { status, json } = await callTool(POST, body({ customer_phone: "", details: marker }));
    expect(status).toBe(400);
    expect(json.speech).toMatch(/number/i);
    const { count } = await db.from("callback_requests").select("id", { count: "exact", head: true }).eq("details", marker);
    expect(count).toBe(0);
  });

  it("rejects a request without the tool secret", async () => {
    const { status } = await callTool(POST, body(), null);
    expect(status).toBe(401);
  });
});
