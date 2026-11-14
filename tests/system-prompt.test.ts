import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { STATUS_PLACEHOLDER } from "@/lib/agent/status-context";
import { TOOLS } from "@/lib/agent/tools";

// Guards the prompt's structure. These do NOT test how the model behaves
// (that is scripts/conversation-tests.ts); they stop a rule being deleted by
// accident when the prompt is edited.

describe("system prompt", () => {
  it("ends with the restaurant status placeholder", () => {
    expect(SYSTEM_PROMPT.trimEnd().endsWith(STATUS_PLACEHOLDER)).toBe(true);
  });

  it("names every tool exactly as defined", () => {
    for (const t of TOOLS) expect(SYSTEM_PROMPT).toContain(t.name);
  });

  it.each([
    ["1. one question then stop", "TURN-TAKING"],
    ["1. question mark is last", "that question mark is the LAST character of your reply"],
    ["2. confirmation gate", "CONFIRMATION GATE"],
    ["2. payment before read-back", "This comes BEFORE the read-back"],
    ["2. cash is not consent", 'The answer to "cash or card" is NOT permission to place the order'],
    ["3. no goodbye with read-back", "Do NOT say goodbye in this reply"],
    ["4. upsell once", "UPSELL_DONE"],
    ["5. break loops", "NEVER ASK A THIRD TIME"],
    ["6. resume after interruption", "RESUMING AFTER AN INTERRUPTION"],
    ["7. digits are the whole reply", "is the WHOLE reply"],
    ["8. one idea per reply", "ONE IDEA PER REPLY"],
    ["no second order after placing", "NEVER call create_order with preview false again"],
    ["bookings section", "TABLE BOOKINGS"],
    ["booking confirmation gate", "BOOKING CONFIRMATION GATE"],
    ["booking confirm question", "Is that all correct, shall I confirm the booking?"],
    ["no second booking", "never call create_booking again"],
    ["big parties go to the shop", "If the party is 9 or more, do not call any tool"],
    ["stop after two failed checks", "If the second check also finds nothing, stop searching"],
  ])("keeps rule: %s", (_label, phrase) => {
    expect(SYSTEM_PROMPT).toContain(phrase);
  });

  it("asks 'Is that all correct?' as the gate question", () => {
    expect(SYSTEM_PROMPT).toContain('"Is that all correct?"');
  });

  it("never uses the pound sign in example speech", () => {
    expect(SYSTEM_PROMPT).not.toContain("£");
  });

  it("phone read-back examples are correct for the digits they claim", () => {
    // Every "Example for 0..." in the prompt must spell the same digits back.
    const words: Record<string, string> = {
      oh: "0", zero: "0", one: "1", two: "2", three: "3", four: "4",
      five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    };
    const re = /Example for (\d{11}): "That's ([^.]+?)\. Is that right\?"/g;
    const found = [...SYSTEM_PROMPT.matchAll(re)];
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const [, number, spoken] of found) {
      let out = "";
      let double = false;
      for (const tok of spoken.split(/[\s,-]+/).filter(Boolean)) {
        if (tok === "double") { double = true; continue; }
        const d = words[tok];
        expect(d, `unknown word "${tok}"`).toBeDefined();
        out += double ? d + d : d;
        double = false;
      }
      expect(out).toBe(number);
    }
  });
});

describe("booking tools", () => {
  const byName = (n: string) => TOOLS.find((t) => t.name === n)!;

  it("check_availability and create_booking are defined, and never take a restaurant id", () => {
    for (const name of ["check_availability", "create_booking"]) {
      const t = byName(name);
      expect(t, name).toBeDefined();
      expect(Object.keys(t.input_schema.properties)).not.toContain("restaurant_id");
    }
  });

  it("descriptions say WHEN to call, not just the topic", () => {
    expect(byName("check_availability").description).toContain("ONLY when");
    expect(byName("create_booking").description).toContain("ONLY when ALL of these are true");
    expect(byName("create_booking").description).toContain("is NOT confirmation");
  });
});
