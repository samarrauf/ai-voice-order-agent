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

/** How much accent the "highlight" tint holds over the dark canvas (active nav item, selected chip). */
export const HIGHLIGHT_MIX = 0.2;

export type AccentSet = {
  /** Tier 1, the button colour (lightened if the given one would vanish on the dark background). */
  accent: string;
  /** Text colour on top of `accent`: AA contrast guaranteed. */
  onAccent: string;
  /** Tier 2, the soft highlight: a faint accent tint on the dark canvas (active/selected backgrounds). */
  highlight: string;
  /** Tier 3, text on the highlight: AA (4.5:1) against `highlight` and the canvas. Also the accent used as small text. */
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
  const highlight = mix(DASH_CANVAS, accent, HIGHLIGHT_MIX);
  let ink = accent;
  for (let i = 0; i < 20 && (contrastRatio(ink, DASH_CANVAS) < AA_TEXT || contrastRatio(ink, highlight) < AA_TEXT); i++) {
    ink = mix(ink, "#FFFFFF", 0.12);
  }
  return { accent, onAccent: onAccent(accent), highlight, ink };
}

// ---------------------------------------------------------------------------
// Three-colour theme (A3a2). The restaurant's primary, secondary and accent all
// show up in the dashboard:
//   brand     = primary   -> buttons, active marks, the page's main colour
//   sage      = secondary -> chips, inactive things, borders (softer)
//   highlight = accent    -> small things only: badges, totals, notification dot
// The dark canvas is derived from the primary (a very dark tint of it), so a
// green restaurant gets a green-black page, not a brown one.
// ---------------------------------------------------------------------------

/** Lightens `hex` step by step until it reaches `min` contrast against EVERY colour in `bgs`. */
function lift(hex: string, bgs: string[], min: number): string {
  let c = hex;
  for (let i = 0; i < 30 && bgs.some((bg) => contrastRatio(c, bg) < min); i++) c = mix(c, "#FFFFFF", 0.1);
  return c;
}

/** Text levels (same for every restaurant; the tests check them against the lightest surface). */
export const INK = "#F3F5F0";
export const INK_MUTED = "#B9C1B2";
export const INK_FAINT = "#A3AC9C";

/** How much the primary tints the canvas and the glass cards. */
const CANVAS_TINT = 0.14;
const SURFACE_TINT = 0.1;

export type DashTheme = {
  canvas: string;
  /** Opaque stand-ins for the glass layers (real glass is semi-transparent; Lite mode uses these). */
  surface: string;
  raised: string;
  line: string;
  lineStrong: string;
  brand: string;
  onBrand: string;
  /** Primary as small text: AA on surface, raised and the brand tint. */
  brandInk: string;
  /** Faint brand wash behind selected/active things. */
  brandTint: string;
  sage: string;
  sageInk: string;
  highlight: string;
  highlightInk: string;
  onHighlight: string;
};

/** Safe dashboard colours from the three theme colours. Anything that is not #RRGGBB falls back. */
export function resolveTheme(
  primary: unknown,
  secondary: unknown,
  accent: unknown,
  fallback: { primary: string; secondary: string; accent: string } = { primary: "#334155", secondary: "#94A3B8", accent: "#E2B93B" },
): DashTheme {
  const p = isHex(primary) ? primary.trim().toUpperCase() : fallback.primary.toUpperCase();
  const s = isHex(secondary) ? secondary.trim().toUpperCase() : fallback.secondary.toUpperCase();
  const a = isHex(accent) ? accent.trim().toUpperCase() : fallback.accent.toUpperCase();

  // A pale primary must not make the page pale: only its hue and a capped lightness tint the canvas.
  const [ph, ps, pl] = toHsl(p);
  const tintSource = pl > 0.4 ? fromHsl(ph, ps, 0.4) : p;
  const canvas = mix("#050505", tintSource, CANVAS_TINT);
  const surface = mix(mix(canvas, tintSource, SURFACE_TINT), "#FFFFFF", 0.05);
  const raised = mix(mix(canvas, tintSource, SURFACE_TINT), "#FFFFFF", 0.1);
  // Buttons, icons and borders sit on the canvas or on cards (surface); 3:1 against those two.
  const brand = lift(p, [canvas, surface], MIN_ACCENT_VS_CANVAS);
  const brandTint = mix(surface, toHsl(brand)[2] > 0.6 ? fromHsl(ph, ps, 0.6) : brand, 0.16);
  const sage = lift(s, [canvas, surface], MIN_ACCENT_VS_CANVAS);
  const highlight = lift(a, [canvas, surface], MIN_ACCENT_VS_CANVAS);
  const grounds = [canvas, surface, raised, brandTint];
  return {
    canvas,
    surface,
    raised,
    line: mix(raised, sage, 0.28),
    lineStrong: mix(raised, sage, 0.5),
    brand,
    onBrand: onAccent(brand),
    brandInk: lift(brand, grounds, AA_TEXT),
    brandTint,
    sage,
    sageInk: lift(sage, grounds, AA_TEXT),
    highlight,
    highlightInk: lift(highlight, grounds, AA_TEXT),
    onHighlight: onAccent(highlight),
  };
}

// ---- Hue / lightness / Lab helpers (used by lib/chart-palette.ts) ----

/** [hue 0-360, saturation 0-1, lightness 0-1] */
export function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

function toLab(hex: string): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual distance between two colours (CIE76 delta E). About 2 = barely visible; 20+ = clearly different. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
