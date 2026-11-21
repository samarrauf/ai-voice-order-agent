import { describe, expect, it } from "vitest";
import { AA_TEXT, DASH_CANVAS, contrastRatio, isHex, luminance, onAccent, resolveAccent } from "@/lib/color";

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#3B82F6", "#16110D")).toBeCloseTo(contrastRatio("#16110D", "#3B82F6"), 8);
  });
  it("luminance of black and white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("onAccent (text colour on the accent)", () => {
  it("picks dark text on light accents and white on dark ones", () => {
    expect(onAccent("#FFFFFF")).toBe("#050505");
    expect(onAccent("#F5C518")).toBe("#050505");
    expect(onAccent("#1E293B")).toBe("#FFFFFF");
    expect(onAccent("#7F1D1D")).toBe("#FFFFFF");
  });
  it("meets AA (4.5:1) on a sweep of colours across the whole range", () => {
    const steps = [0, 51, 102, 153, 204, 255];
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
          expect(contrastRatio(hex, onAccent(hex)), hex).toBeGreaterThanOrEqual(AA_TEXT);
        }
  });
});

describe("resolveAccent", () => {
  it("keeps a good colour as it is (upper-cased) with AA text on top", () => {
    const a = resolveAccent("#3b82f6");
    expect(a.accent).toBe("#3B82F6");
    expect(contrastRatio(a.accent, a.onAccent)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("falls back for values that are not #RRGGBB", () => {
    for (const bad of [undefined, null, "", "red", "#fff", "#12345", "#GGGGGG", "rgb(1,2,3)", 42, "#3B82F6; color: red"]) {
      expect(resolveAccent(bad, "#10B981").accent, String(bad)).toBe("#10B981");
    }
  });
  it("lightens a too-dark accent until it can be seen on the dark background", () => {
    for (const dark of ["#000000", "#0A0A0A", "#1E293B", "#2A1A10"]) {
      const a = resolveAccent(dark);
      expect(contrastRatio(a.accent, DASH_CANVAS), dark).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(a.accent, a.onAccent), dark).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
  it("keeps a pale accent pale (it is already visible) and uses dark text on it", () => {
    const a = resolveAccent("#FDE68A");
    expect(a.accent).toBe("#FDE68A");
    expect(a.onAccent).toBe("#050505");
  });
  it("accent-as-text (ink) always has AA contrast on the dark background", () => {
    for (const hex of ["#000000", "#3B82F6", "#7F1D1D", "#556B2F", "#FFFFFF", "#6B8E23"]) {
      expect(contrastRatio(resolveAccent(hex).ink, DASH_CANVAS), hex).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
  it("isHex is strict", () => {
    expect(isHex("#3B82F6")).toBe(true);
    expect(isHex("3B82F6")).toBe(false);
    expect(isHex("#3B82F")).toBe(false);
  });
});
