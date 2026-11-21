import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/check-delivery/route";
import { RID, RUN_MARKER, callTool, db } from "./helpers/helpers";

function check(postcode: unknown) {
  return callTool(POST, { restaurant_id: RID, postcode });
}

describe("check-delivery", () => {
  it("accepts M14, refuses SW1A, refuses nonsense without crashing", async () => {
    const m14 = await check("M14 5TP");
    expect(m14.status).toBe(200);
    expect(m14.json.deliverable).toBe(true);

    const sw1a = await check("SW1A 1AA");
    expect(sw1a.status).toBe(200);
    expect(sw1a.json.deliverable).toBe(false);
    expect(sw1a.json.speech).toMatch(/don't deliver/i);

    for (const nonsense of ["!!!???", "", "banana", 12345]) {
      const r = await check(nonsense);
      expect(r.status).toBeLessThan(500); // handled, not a crash
      expect(r.json.deliverable).not.toBe(true);
      expect(typeof r.json.speech).toBe("string");
    }
  });

  it("a null delivery_fee does NOT produce a free-delivery message", async () => {
    // A throwaway restaurant born with a null fee: the live Napoli row is never touched.
    const made = await db.from("restaurants").insert({ name: `${RUN_MARKER}-nullfee`, delivery_fee: null }).select("id").single();
    if (made.error) throw made.error;
    try {
      const { json } = await callTool(POST, { restaurant_id: made.data.id, postcode: "M14 5TP" });
      expect(json.deliverable).toBe(false);
      expect(json.speech).not.toMatch(/free/i);
      expect(json.speech).toMatch(/hold on|check/i);
    } finally {
      await db.from("restaurants").delete().eq("id", made.data.id);
    }
  });
});
