// The maths behind components/ui/count-up.tsx, kept pure so it can be tested:
// when motion is allowed, how far a number has counted after some time.

export const COUNT_DURATION_MS = 900;

/** Motion plays only when neither reduced motion nor Lite mode (lib/lite-mode.ts) is on. */
export function motionAllowed({ prefersReducedMotion, lite }: { prefersReducedMotion: boolean; lite: boolean }): boolean {
  return !prefersReducedMotion && !lite;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The number to show `elapsed` ms into the count. Without motion (`animate` false),
 * or for a zero/negative duration, it is the final figure straight away.
 */
export function countFrame({ elapsed, duration = COUNT_DURATION_MS, from, to, animate }: { elapsed: number; duration?: number; from: number; to: number; animate: boolean }): number {
  if (!animate || !(duration > 0) || elapsed >= duration) return to;
  return from + (to - from) * easeOutCubic(elapsed / duration);
}
