import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountUp } from "@/components/ui/count-up";
import { COUNT_DURATION_MS, countFrame, easeOutCubic, motionAllowed } from "@/lib/count-up";

describe("count-up maths", () => {
  it("runs for 900ms", () => {
    expect(COUNT_DURATION_MS).toBe(900);
  });
  it("motion plays only without reduced motion and without Lite mode", () => {
    expect(motionAllowed({ prefersReducedMotion: false, lite: false })).toBe(true);
    expect(motionAllowed({ prefersReducedMotion: true, lite: false })).toBe(false);
    expect(motionAllowed({ prefersReducedMotion: false, lite: true })).toBe(false);
  });
  it("reduced motion or Lite shows the final figure at the very first frame", () => {
    expect(countFrame({ elapsed: 0, from: 0, to: 250, animate: false })).toBe(250);
    expect(countFrame({ elapsed: 10, from: 0, to: 250, animate: motionAllowed({ prefersReducedMotion: true, lite: false }) })).toBe(250);
  });
  it("with motion it starts at the old figure, rises, and ends exactly on the target", () => {
    expect(countFrame({ elapsed: 0, from: 0, to: 100, animate: true })).toBe(0);
    const mid = countFrame({ elapsed: 450, from: 0, to: 100, animate: true });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(countFrame({ elapsed: 900, from: 0, to: 100, animate: true })).toBe(100);
    expect(countFrame({ elapsed: 5000, from: 0, to: 100, animate: true })).toBe(100);
  });
  it("counts down as well, and easing stays within 0..1", () => {
    expect(countFrame({ elapsed: 450, from: 100, to: 0, animate: true })).toBeLessThan(100);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("CountUp component on the server", () => {
  it("renders the final figure (nothing is wrong without JavaScript or with reduced motion)", () => {
    const html = renderToString(createElement(CountUp, { value: 1234 }));
    expect(html).toContain("1,234");
    expect(html).not.toContain(">0<");
  });
  it("formats money and percentages", () => {
    expect(renderToString(createElement(CountUp, { value: 8.5, currency: "GBP" }))).toContain("£8.50");
    expect(renderToString(createElement(CountUp, { value: 1250, currency: "PKR" }))).toContain("Rs 1,250");
    expect(renderToString(createElement(CountUp, { value: 72, suffix: "%" }))).toContain("72%");
  });
});
