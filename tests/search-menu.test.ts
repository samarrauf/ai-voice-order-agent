import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/tools/search-menu/route";
import { RID, callTool } from "./helpers/helpers";

// Speech-to-text mishears food names; search must still find the right dish.

async function search(query: string) {
  return callTool(POST, { restaurant_id: RID, query });
}

describe("search-menu", () => {
  it('"margarita" returns Margherita', async () => {
    const { status, json } = await search("margarita");
    expect(status).toBe(200);
    expect(json.matches[0].name).toBe("Margherita");
  });

  it('"pepper only" returns Pepperoni', async () => {
    const { status, json } = await search("pepper only");
    expect(status).toBe(200);
    expect(json.matches[0].name).toBe("Pepperoni");
  });

  it('"ham and pineapple" returns Hawaiian', async () => {
    const { status, json } = await search("ham and pineapple");
    expect(status).toBe(200);
    expect(json.matches[0].name).toBe("Hawaiian");
  });

  it('"xyzabc" returns no matches with a helpful speech string', async () => {
    const { status, json } = await search("xyzabc");
    expect(status).toBe(200);
    expect(json.matches).toEqual([]);
    expect(typeof json.speech).toBe("string");
    // Helpful = tells the caller what we do sell and asks again.
    expect(json.speech).toMatch(/pizza/i);
    expect(json.speech).toContain("?");
  });
});
