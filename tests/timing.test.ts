import { describe, expect, it } from "vitest";
import { POST as checkDelivery } from "@/app/api/tools/check-delivery/route";
import { startTimer } from "@/lib/timing";
import { RID } from "./helpers/helpers";

function post(secret: string, body: unknown) {
  return new Request("http://localhost/api/tools/check-delivery", {
    method: "POST",
    headers: { "content-type": "application/json", "x-tool-secret": secret },
    body: JSON.stringify(body),
  });
}

// "auth;dur=0.2, db;dur=38.1, total;dur=39.6" -> { auth: 0.2, db: 38.1, total: 39.6 }
function parseServerTiming(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (header ?? "").split(",")) {
    const m = /^\s*([a-z]+);dur=(\d+(?:\.\d+)?)\s*$/.exec(part);
    if (!m) throw new Error(`unexpected Server-Timing part: "${part}"`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

describe("Server-Timing", () => {
  it("a successful tool call reports auth, parse, db and total", async () => {
    const res = await checkDelivery(post(process.env.TOOL_API_SECRET!, { restaurant_id: RID, postcode: "M14 5TP" }));
    expect(res.status).toBe(200);
    const t = parseServerTiming(res.headers.get("server-timing"));
    expect(Object.keys(t)).toEqual(["auth", "parse", "db", "total"]);
    expect(t.total).toBeGreaterThanOrEqual(t.db);
  });

  it("a rejected call (wrong secret) is still timed, and leaks nothing but numbers", async () => {
    const res = await checkDelivery(post("wrong-secret", { restaurant_id: RID, postcode: "M14 5TP" }));
    expect(res.status).toBe(401);
    const header = res.headers.get("server-timing")!;
    expect(Object.keys(parseServerTiming(header))).toEqual(["auth", "total"]);
    expect(header).not.toMatch(/M14|wrong|1111/);
  });

  it("laps measure the time between marks", async () => {
    const timer = startTimer();
    await new Promise((r) => setTimeout(r, 20));
    timer.lap("wait");
    const res = timer.finish("test", new Response("ok"));
    const t = parseServerTiming(res.headers.get("server-timing"));
    expect(t.wait).toBeGreaterThanOrEqual(15);
    expect(t.total).toBeGreaterThanOrEqual(t.wait);
  });
});
