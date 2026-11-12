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

  // JUNK GUARD: values the model has really sent before it had the caller's details.
  const savedCount = async (marker: string) => {
    const { count } = await db.from("callback_requests").select("id", { count: "exact", head: true }).eq("details", marker);
    return count;
  };

  it.each(["Unknown", "unknown caller", "Caller", "N/A", "  ", "123"])(
    "rejects placeholder name %j, asks for the name, saves nothing",
    async (name) => {
      const marker = `${RUN_MARKER}-name-${name}`;
      const { status, json } = await callTool(POST, body({ customer_name: name, details: marker }));
      expect(status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.speech).toMatch(/name/i);
      expect(json.speech).not.toMatch(/£/);
      expect(await savedCount(marker)).toBe(0);
    },
  );

  it.each([
    ["0", "0"],
    ["3-digit number", "999"],
    ["all zeros", "00000000000"],
  ])("rejects phone %s, asks for a number, saves nothing", async (_label, phone) => {
    const marker = `${RUN_MARKER}-phone-${phone}`;
    const { status, json } = await callTool(POST, body({ customer_phone: phone, details: marker }));
    expect(status).toBe(400);
    expect(json.speech).toMatch(/number/i);
    expect(await savedCount(marker)).toBe(0);
  });

  it('rejects "Unknown" + "0" together (the exact call seen in testing)', async () => {
    const marker = `${RUN_MARKER}-unknown-0`;
    const { status, json } = await callTool(POST, body({ customer_name: "Unknown", customer_phone: "0", details: marker }));
    expect(status).toBe(400);
    expect(json.speech).toBe("Sorry, could I take your name for the callback?");
    expect(await savedCount(marker)).toBe(0);
  });

  it("rejects an empty body", async () => {
    const before = (await db.from("callback_requests").select("id", { count: "exact", head: true })).count;
    // What the model sent ({}), as it arrives after the server adds restaurant_id…
    const asSent = await callTool(POST, { restaurant_id: RID });
    expect(asSent.status).toBe(400);
    expect(asSent.json.speech).toMatch(/name/i);
    // …and a truly empty body.
    const empty = await callTool(POST, {});
    expect(empty.status).toBe(400);
    expect(typeof empty.json.speech).toBe("string");
    const after = (await db.from("callback_requests").select("id", { count: "exact", head: true })).count;
    expect(after).toBe(before);
  });

  it('treats callback_id "" as not set (creates a request instead of failing)', async () => {
    const marker = `${RUN_MARKER}-empty-id`;
    const { status, json } = await callTool(POST, body({ callback_id: "", details: marker }));
    expect(status).toBe(200);
    expect(json.updated).toBe(false);
    expect(await savedCount(marker)).toBe(1);
  });

  it("still accepts a real name that contains a placeholder word", async () => {
    const marker = `${RUN_MARKER}-real-name`;
    const { status } = await callTool(POST, body({ customer_name: "Tess Unknown-Smith", details: marker }));
    expect(status).toBe(200);
  });

  it("rejects a request without the tool secret", async () => {
    const { status } = await callTool(POST, body(), null);
    expect(status).toBe(401);
  });
});
