import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOLS } from "@/lib/agent/tools";
import { STATUS_PLACEHOLDER } from "@/lib/agent/status-context";
import { buildSystemPrompt, buildTools, type AgentSettings } from "@/lib/agent/prompt-variants";
import type { DeliveryMode } from "@/lib/delivery";

// P9a-B: the prompt and tools per restaurant (delivery mode + currency).
// The fixtures are copies of Napoli's prompt and tools taken BEFORE this change,
// so these tests prove Napoli's agent is byte-for-byte what it was.

const fixturePrompt = (JSON.parse(readFileSync("tests/fixtures/napoli-system-prompt.json", "utf8")) as { system_prompt: string }).system_prompt;
const fixtureTools = JSON.parse(readFileSync("tests/fixtures/napoli-tools.json", "utf8"));

const MODES: DeliveryMode[] = ["postcode", "area_list", "none"];
const CURRENCIES = ["GBP", "PKR", "EUR"];

describe("Napoli (postcode, GBP) is unchanged", () => {
  it("SYSTEM_PROMPT and buildSystemPrompt give exactly the saved prompt", () => {
    expect(SYSTEM_PROMPT).toBe(fixturePrompt);
    expect(buildSystemPrompt({ deliveryMode: "postcode", currency: "GBP" })).toBe(fixturePrompt);
    // A missing currency means GBP.
    expect(buildSystemPrompt({ deliveryMode: "postcode", currency: null })).toBe(fixturePrompt);
  });

  it("TOOLS and buildTools give exactly the saved tools", () => {
    expect(JSON.parse(JSON.stringify(TOOLS))).toEqual(fixtureTools);
    expect(buildTools({ deliveryMode: "postcode", currency: "GBP" })).toEqual(fixtureTools);
  });
});

describe("every mode and currency builds a whole prompt", () => {
  for (const deliveryMode of MODES) {
    for (const currency of CURRENCIES) {
      it(`${deliveryMode} · ${currency}`, () => {
        const s: AgentSettings = { deliveryMode, currency };
        const prompt = buildSystemPrompt(s);
        expect(prompt.trimEnd().endsWith(STATUS_PLACEHOLDER)).toBe(true);
        for (const t of TOOLS) expect(prompt).toContain(t.name);
        // The core rules survive every variant.
        for (const rule of ["TURN-TAKING", "CONFIRMATION GATE", "UPSELL_DONE", "NEVER ASK A THIRD TIME", "is the WHOLE reply", "THE TOTAL", "ALLERGENS: NEVER GUESS"]) {
          expect(prompt, rule).toContain(rule);
        }
        expect(prompt).not.toMatch(/[£€$]|\bRs\b|\bPKR\b/);
        const tools = buildTools(s);
        expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
      });
    }
  }
});

describe("non-GBP currency", () => {
  it("prices are said with the currency word; no pound, no GBP example amounts", () => {
    const prompt = buildSystemPrompt({ deliveryMode: "area_list", currency: "PKR" });
    expect(prompt).toContain('followed by the word "rupees"');
    expect(prompt).toContain('"currency_word"');
    expect(prompt).not.toMatch(/pound/i);
    expect(prompt).not.toMatch(/\b(8\.99|10\.99|2\.50)\b/);
    expect(prompt).toContain("It's 150 rupees for delivery");
  });

  it("a postcode restaurant in euros keeps its postcode rules", () => {
    const prompt = buildSystemPrompt({ deliveryMode: "postcode", currency: "EUR" });
    expect(prompt).toContain("POSTCODE EARLY");
    expect(prompt).toContain("8.99 euros");
  });
});

describe("area_list", () => {
  const prompt = buildSystemPrompt({ deliveryMode: "area_list", currency: "PKR" });
  const tools = buildTools({ deliveryMode: "area_list", currency: "PKR" });
  const byName = (n: string) => tools.find((t) => t.name === n)!;

  it("the prompt never talks about postcodes; it asks for the area", () => {
    expect(prompt).not.toMatch(/\bpostcode\b/i); // "we do not use postcodes" is allowed
    expect(prompt).not.toContain("M-one-four");
    expect(prompt).toContain("AREA EARLY");
    expect(prompt).toContain("which area are you in");
    expect(prompt).toContain("never promise delivery yourself");
  });

  it("check_delivery takes an area, create_order a delivery_area", () => {
    expect(byName("check_delivery").description).not.toMatch(/\bpostcode\b/i);
    expect(byName("check_delivery").input_schema).toMatchObject({ required: ["area"] });
    const props = (byName("create_order").input_schema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("delivery_area");
    expect(props).not.toHaveProperty("delivery_postcode");
    expect(byName("create_order").description).not.toMatch(/\bpostcode\b/i);
  });
});

describe("none (collection only)", () => {
  const prompt = buildSystemPrompt({ deliveryMode: "none", currency: "PKR" });
  const tools = buildTools({ deliveryMode: "none", currency: "PKR" });
  const order = tools.find((t) => t.name === "create_order")!;

  it("the prompt is collection only, with no postcode or area talk", () => {
    expect(prompt).not.toMatch(/\bpostcode\b/i); // "we do not use postcodes" is allowed
    expect(prompt).toContain("COLLECTION ONLY");
    expect(prompt).not.toContain('Ask "Is that for delivery or collection?"');
  });

  it("create_order can only be a collection", () => {
    const props = (order.input_schema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.fulfilment_type.enum).toEqual(["pickup"]);
    expect(props).not.toHaveProperty("delivery_address");
    expect(props).not.toHaveProperty("delivery_postcode");
    expect(order.description).not.toMatch(/postcode/i);
  });
});
