// Colour maths for the dashboard theme. Pure module (no server imports).
// The restaurant's accent colour comes from the database and can be anything
// (too dark, too pale, or not even a colour). resolveAccent() turns it into a
// safe set of colours: text on top of the accent always meets WCAG AA (4.5:1)
// and the accent itself stays visible on the dark dashboard background.
// Print pages do NOT use this: they keep readableOn() in lib/branding.ts.

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The dashboard's darkest surface; the accent must stay visible against it. */
export const DASH_CANVAS = "#16110d";
export const ON_ACCENT_LIGHT = "#FFFFFF";
// Near-black on purpose: with a lighter dark (e.g. #111) mid-tone accents (about #777) reach neither side of 4.5:1.
export const ON_ACCENT_DARK = "#050505";
export const AA_TEXT = 4.5;
const MIN_ACCENT_VS_CANVAS = 3; // WCAG non-text contrast

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.trim().slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes `hex` towards `target` by `amount` (0 to 1). */
export function mix(hex: string, target: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

/** Black or white text, whichever has the higher contrast on `hex`. Always at least 4.5:1. */
export function onAccent(hex: string): string {
  return contrastRatio(hex, ON_ACCENT_DARK) >= contrastRatio(hex, ON_ACCENT_LIGHT) ? ON_ACCENT_DARK : ON_ACCENT_LIGHT;
}

export type AccentSet = {
  /** The accent to paint with (lightened if the given one would vanish on the dark background). */
  accent: string;
  /** Text colour on top of `accent`: AA contrast guaranteed. */
  onAccent: string;
  /** The accent used as text on the dark background (AA contrast guaranteed). */
  ink: string;
};

/**
 * Safe colours from a theme accent. Not a #RRGGBB colour -> the fallback is used.
 * Too dark to see on the dark background -> lightened step by step until it can be seen.
 */
export function resolveAccent(hex: unknown, fallback = "#3B82F6"): AccentSet {
  let accent = isHex(hex) ? hex.trim().toUpperCase() : fallback.toUpperCase();
  for (let i = 0; i < 20 && contrastRatio(accent, DASH_CANVAS) < MIN_ACCENT_VS_CANVAS; i++) {
    accent = mix(accent, "#FFFFFF", 0.12);
  }
  let ink = accent;
  for (let i = 0; i < 20 && contrastRatio(ink, DASH_CANVAS) < AA_TEXT; i++) {
    ink = mix(ink, "#FFFFFF", 0.12);
  }
  return { accent, onAccent: onAccent(accent), ink };
}
