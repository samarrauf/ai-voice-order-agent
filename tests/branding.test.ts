import { describe, expect, it } from "vitest";
import { brandingFromRow, DEFAULT_BRANDING, readableOn, sanitizeHex } from "@/lib/branding";

describe("sanitizeHex", () => {
  it("accepts a 6-digit hex code", () => expect(sanitizeHex("#1E293B", "#000000")).toBe("#1E293B"));
  it("rejects anything else", () => {
    expect(sanitizeHex("red", "#000000")).toBe("#000000");
    expect(sanitizeHex("#fff", "#000000")).toBe("#000000");
    expect(sanitizeHex("#111111;background:url(x)", "#000000")).toBe("#000000");
    expect(sanitizeHex(null, "#000000")).toBe("#000000");
  });
});

describe("readableOn", () => {
  it("uses white on dark and dark on light", () => {
    expect(readableOn("#1E293B")).toBe("#FFFFFF");
    expect(readableOn("#FFFFFF")).toBe("#111111");
  });
});

describe("brandingFromRow", () => {
  it("falls back to defaults when the row is missing", () => expect(brandingFromRow(null)).toEqual(DEFAULT_BRANDING));
  it("reads a full row and ignores bad colours", () => {
    const b = brandingFromRow({
      name: "Napoli Pizza & Grill",
      tagline: null,
      parent_group_name: " Olive Group ",
      theme_primary: "#112233",
      theme_accent: "nope",
    });
    expect(b.name).toBe("Napoli Pizza & Grill");
    expect(b.parentGroupName).toBe("Olive Group");
    expect(b.primary).toBe("#112233");
    expect(b.accent).toBe(DEFAULT_BRANDING.accent);
  });
});
