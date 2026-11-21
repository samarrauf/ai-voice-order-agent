import { colorDistance, contrastRatio, fromHsl, resolveTheme, toHsl } from "@/lib/color";

// Colours for charts (built in A3b): eight series colours from the restaurant's
// three theme colours plus colours derived from them (lighter/darker, hue shifted
// a little). Rules: every colour reads on the dark glass (3:1), no two are close
// (MIN_CHART_DISTANCE) and red and green never sit next to each other in the
// series order (colour-blind viewers cannot tell them apart).
// Only this helper and the --chart-1..8 CSS variables exist now; no chart yet.

export const CHART_COLORS = 8;
/** Smallest allowed perceptual distance (delta E) between any two chart colours. */
export const MIN_CHART_DISTANCE = 14;
const MIN_ON_GLASS = 3;

const isRed = (hex: string) => {
  const [h, s] = toHsl(hex);
  return s > 0.25 && (h <= 20 || h >= 340);
};
const isGreen = (hex: string) => {
  const [h, s] = toHsl(hex);
  return s > 0.2 && h >= 70 && h <= 165;
};
/** True when two colours form a red-green pair. */
export function isRedGreenPair(a: string, b: string): boolean {
  return (isRed(a) && isGreen(b)) || (isGreen(a) && isRed(b));
}

/** Lighter/darker and hue-shifted relatives of one theme colour. */
function relatives(hex: string): string[] {
  const [h, s, l] = toHsl(hex);
  const out: string[] = [];
  if (s < 0.15) {
    // Grey, black or white has no hue to shift: spread hues around the wheel instead.
    for (const hue of [30, 90, 150, 210, 270, 330]) for (const lightness of [0.55, 0.75]) out.push(fromHsl(hue, 0.55, lightness));
    return out;
  }
  for (const dh of [0, -32, 32, -64, 64]) {
    for (const dl of [-0.16, 0, 0.16, 0.3]) {
      if (dh === 0 && dl === 0) continue;
      out.push(fromHsl(h + dh, Math.min(1, Math.max(0.35, s)), Math.min(0.85, Math.max(0.3, l + dl))));
    }
  }
  return out;
}

/**
 * Eight chart colours for a restaurant: the brand colour, then each time the
 * colour (theme colour or derived one) farthest from everything chosen so far.
 */
export function chartPalette(primary: unknown, secondary: unknown, accent: unknown): string[] {
  const t = resolveTheme(primary, secondary, accent);
  const ground = t.surface; // charts sit on glass cards
  const base = [t.brand, t.sage, t.highlight];
  // A theme colour that looks like an earlier one (Napoli's slates) is dropped: no near-duplicates.
  const chosen: string[] = [];
  for (const c of base) if (chosen.every((x) => colorDistance(c, x) >= MIN_CHART_DISTANCE)) chosen.push(c);
  const pool = [...new Set(base.flatMap(relatives))].filter((c) => !chosen.includes(c) && !isRed(c) && contrastRatio(c, ground) >= MIN_ON_GLASS);
  while (chosen.length < CHART_COLORS && pool.length) {
    let best = 0;
    let bestScore = -1;
    pool.forEach((c, i) => {
      const score = Math.min(...chosen.map((x) => colorDistance(c, x)));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    chosen.push(pool.splice(best, 1)[0]);
  }

  // Order so that no red-green pair is adjacent, keeping the chosen order wherever possible.
  const order: string[] = [];
  const rest = [...chosen];
  while (rest.length) {
    const prev = order[order.length - 1];
    const i = rest.findIndex((c) => !prev || !isRedGreenPair(prev, c));
    order.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return order;
}

/** CSS custom properties --chart-1 .. --chart-8 for a style attribute. */
export function chartCssVars(palette: string[]): Record<string, string> {
  return Object.fromEntries(palette.map((c, i) => [`--chart-${i + 1}`, c]));
}
