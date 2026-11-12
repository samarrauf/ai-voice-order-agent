import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/request-callback/route";
import { phoneForSpeech } from "@/lib/speech";
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

  it("a mis-copied number is caught: the speech echoes what was STORED, not what the caller said", async () => {
    const callerSaid = "07700900456";
    const agentSent = "07770090456"; // two digits swapped while copying — the real bug we saw
    const { status, json } = await callTool(POST, body({ customer_phone: agentSent, details: `${RUN_MARKER}-miscopy` }));
    expect(status).toBe(200);
    expect(json.stored_phone).toBe(agentSent);
    expect(json.speech).toContain(phoneForSpeech(agentSent));
    // The caller hears something different from what they said, so they can object.
    expect(json.speech).not.toContain(phoneForSpeech(callerSaid));
  });

  it("a correction with callback_id updates the same row instead of creating a second one", async () => {
    const marker = `${RUN_MARKER}-correction`;
    const first = await callTool(POST, body({ customer_phone: "07770090456", details: marker }));
    expect(first.json.updated).toBe(false);

    const second = await callTool(
      POST,
      body({ callback_id: first.json.callback_id, customer_phone: "07700 900 456", details: marker }),
    );
    expect(second.status).toBe(200);
    expect(second.json.updated).toBe(true);
    expect(second.json.callback_id).toBe(first.json.callback_id);
    expect(second.json.speech).toContain(phoneForSpeech("07700900456"));

    const { data } = await db.from("callback_requests").select("id, customer_phone").eq("details", marker);
    expect(data).toHaveLength(1);
    expect(data![0].customer_phone).toBe("07700900456");
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
