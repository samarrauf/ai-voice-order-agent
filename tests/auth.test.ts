/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { RID, callTool } from "./helpers/helpers";

// Every /api/tools/* route is found automatically, so a future tool route
// without the secret check fails this test the moment it's added.
const routes = import.meta.glob<{ POST: (req: Request) => Promise<Response> }>(
  "../app/api/tools/*/route.ts",
  { eager: true },
);
const entries = Object.entries(routes).map(([file, mod]) => [file.split("/").at(-2)!, mod.POST] as const);

// A body that would otherwise be valid for any tool, so a 401 can only come from auth.
const body = { restaurant_id: RID, query: "pepperoni", postcode: "M14 5TP" };

describe("auth", () => {
  it("finds the tool routes", () => {
    expect(entries.map(([name]) => name).sort()).toEqual(
      expect.arrayContaining(["check-delivery", "create-order", "search-menu"]),
    );
  });

  it.each(entries)("missing x-tool-secret returns 401 on /api/tools/%s", async (_name, POST) => {
    const { status } = await callTool(POST, body, null);
    expect(status).toBe(401);
  });

  it.each(entries)("wrong x-tool-secret returns 401 on /api/tools/%s", async (_name, POST) => {
    const { status } = await callTool(POST, body, "definitely-not-the-secret");
    expect(status).toBe(401);
  });
});
