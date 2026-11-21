import { describe, expect, it } from "vitest";
import { AA_TEXT, INK, INK_FAINT, INK_MUTED, colorDistance, contrastRatio, isHex, resolveTheme } from "@/lib/color";
import { CHART_COLORS, MIN_CHART_DISTANCE, chartCssVars, chartPalette, isRedGreenPair } from "@/lib/chart-palette";
import { OLIVE_LOGO_PATH, topBarLogo } from "@/lib/brand-logo";

// The two live restaurants' theme colours (primary, secondary, accent) plus awkward ones.
const OLIVE = ["#556b3f", "#8fa377", "#c9a227"] as const;
const NAPOLI = ["#1E293B", "#64748B", "#3B82F6"] as const;
const AWKWARD: (readonly [string, string, string])[] = [
  ["#000000", "#000000", "#000000"],
  ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
  ["#7F1D1D", "#F5C518", "#16A34A"],
  ["#777777", "#777777", "#777777"],
  ["#2B6CB0", "#ED8936", "#9F7AEA"],
];
const ALL = [OLIVE, NAPOLI, ...AWKWARD];

describe("resolveTheme: tokens meet contrast on the dark glass", () => {
  for (const [p, s, a] of ALL) {
    it(`${p} ${s} ${a}`, () => {
      const t = resolveTheme(p, s, a);
      const grounds = [t.canvas, t.surface, t.raised];
      for (const g of grounds) {
        // Non-text (buttons, icons, borders): 3:1.
        if (g !== t.raised) for (const c of [t.brand, t.sage, t.highlight]) expect(contrastRatio(c, g), `${c} on ${g}`).toBeGreaterThanOrEqual(3);
        // Text: AA.
        for (const c of [INK, INK_MUTED, INK_FAINT, t.brandInk, t.sageInk, t.highlightInk]) {
          expect(contrastRatio(c, g), `${c} on ${g}`).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
      for (const c of [INK, INK_MUTED, INK_FAINT, t.brandInk, t.sageInk, t.highlightInk]) {
        expect(contrastRatio(c, t.brandTint), `${c} on tint`).toBeGreaterThanOrEqual(AA_TEXT);
      }
      // Text on the filled buttons / badges.
      expect(contrastRatio(t.brand, t.onBrand)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.highlight, t.onHighlight)).toBeGreaterThanOrEqual(AA_TEXT);
      // Borders must be visible against the card.
      expect(contrastRatio(t.lineStrong, t.canvas)).toBeGreaterThanOrEqual(1.5);
    });
  }

  it("Olive: brand is the green, sage the sage, highlight the gold (brand only lightened a little to reach 3:1)", () => {
    const t = resolveTheme(...OLIVE);
    expect(colorDistance(t.brand, "#556B3F")).toBeLessThan(16);
    expect(t.sage.toUpperCase()).toBe("#8FA377");
    expect(t.highlight.toUpperCase()).toBe("#C9A227");
  });
  it("Olive canvas is a dark green-black, not brown", () => {
    const t = resolveTheme(...OLIVE);
    const n = parseInt(t.canvas.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThan(40);
  });
  it("Napoli gets its own colours (blue, not green)", () => {
    const o = resolveTheme(...OLIVE);
    const n = resolveTheme(...NAPOLI);
    expect(n.canvas).not.toBe(o.canvas);
    expect(n.brand).not.toBe(o.brand);
    expect(colorDistance(n.highlight, "#3B82F6")).toBeLessThan(12);
  });
  it("bad input falls back to a valid theme", () => {
    const t = resolveTheme("nope", null, 42);
    for (const c of [t.canvas, t.brand, t.sage, t.highlight]) expect(isHex(c)).toBe(true);
  });
});

describe("chartPalette", () => {
  for (const [p, s, a] of ALL) {
    it(`8 distinct, readable colours for ${p} ${s} ${a}`, () => {
      const pal = chartPalette(p, s, a);
      const t = resolveTheme(p, s, a);
      expect(pal).toHaveLength(CHART_COLORS);
      expect(new Set(pal).size).toBe(CHART_COLORS);
      for (const c of pal) {
        expect(isHex(c)).toBe(true);
        for (const g of [t.canvas, t.surface]) expect(contrastRatio(c, g), `${c} on ${g}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
  // Fully grey / black / white themes cannot produce eight different colours (nothing to shift), so the spacing rule is checked on real colour themes.
  for (const [p, s, a] of [OLIVE, NAPOLI, AWKWARD[2], AWKWARD[4]]) {
    it(`keeps every pair far apart and red away from green for ${p} ${s} ${a}`, () => {
      const pal = chartPalette(p, s, a);
      let min = Infinity;
      for (let i = 0; i < pal.length; i++) for (let j = i + 1; j < pal.length; j++) min = Math.min(min, colorDistance(pal[i], pal[j]));
      expect(min).toBeGreaterThanOrEqual(MIN_CHART_DISTANCE);
      for (let i = 0; i + 1 < pal.length; i++) expect(isRedGreenPair(pal[i], pal[i + 1]), `${pal[i]} next to ${pal[i + 1]}`).toBe(false);
    });
  }
  it("starts with the three theme colours (brand, sage, highlight) as a mix", () => {
    const t = resolveTheme(...OLIVE);
    const pal = chartPalette(...OLIVE);
    for (const c of [t.brand, t.sage, t.highlight]) expect(pal).toContain(c);
  });
  it("isRedGreenPair", () => {
    expect(isRedGreenPair("#DC2626", "#16A34A")).toBe(true);
    expect(isRedGreenPair("#2563EB", "#16A34A")).toBe(false);
  });
  it("chartCssVars names --chart-1 to --chart-8", () => {
    const vars = chartCssVars(chartPalette(...OLIVE));
    expect(Object.keys(vars)).toEqual(Array.from({ length: 8 }, (_, i) => `--chart-${i + 1}`));
  });
});

describe("topBarLogo (logo or first letter)", () => {
  it("uses the saved logo_url", () => {
    expect(topBarLogo("Napoli Pizza", "/brand/x.png")).toEqual({ src: "/brand/x.png", initial: "N" });
    expect(topBarLogo("Napoli Pizza", "https://cdn.example.com/l.png").src).toBe("https://cdn.example.com/l.png");
  });
  it("Olive without a saved logo uses the shipped file", () => {
    expect(topBarLogo("Olive 'n Spice", null).src).toBe(OLIVE_LOGO_PATH);
  });
  it("no logo -> first letter of the name", () => {
    expect(topBarLogo("napoli", null)).toEqual({ src: null, initial: "N" });
    expect(topBarLogo("  ", "")).toEqual({ src: null, initial: "?" });
  });
  it("unsafe logo values are ignored", () => {
    for (const bad of ["javascript:alert(1)", "//evil.example/x.png", "http://insecure.example/x.png", "/a\\b", 5, undefined]) {
      expect(topBarLogo("Napoli", bad).src).toBeNull();
    }
  });
});
