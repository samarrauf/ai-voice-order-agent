import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, verifySessionToken } from "@/lib/dashboard-auth";

const PW = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;

describe("dashboard password", () => {
  it("accepts the right password", () => expect(checkPassword(PW, PW)).toBe(true));
  it("rejects a wrong or empty password", () => {
    expect(checkPassword("nope", PW)).toBe(false);
    expect(checkPassword("", PW)).toBe(false);
  });
  it("rejects everything if no password is configured", () => {
    expect(checkPassword("", "")).toBe(false);
    expect(checkPassword("anything", undefined)).toBe(false);
  });
});

describe("dashboard session token", () => {
  const now = Date.now();
  it("is valid right after creation and for just under 7 days", () => {
    const t = createSessionToken(now, PW)!;
    expect(verifySessionToken(t, now, PW)).toBe(true);
    expect(verifySessionToken(t, now + 7 * DAY - 1000, PW)).toBe(true);
  });
  it("expires after 7 days", () => {
    const t = createSessionToken(now, PW)!;
    expect(verifySessionToken(t, now + 7 * DAY + 1000, PW)).toBe(false);
  });
  it("rejects missing, garbage, tampered and wrong-password tokens", () => {
    const t = createSessionToken(now, PW)!;
    const [expiry, sig] = t.split(".");
    expect(verifySessionToken(undefined, now, PW)).toBe(false);
    expect(verifySessionToken("garbage", now, PW)).toBe(false);
    expect(verifySessionToken(`${Number(expiry) + 99999999}.${sig}`, now, PW)).toBe(false);
    expect(verifySessionToken(t, now, "different-password")).toBe(false);
  });
  it("cannot be made when no password is configured", () => {
    expect(createSessionToken(now, "")).toBeNull();
  });
});
