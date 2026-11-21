import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { SESSION_HOURS, getSessionSecret, hasRole, signSession, verifySession } from "@/lib/session";

// Pure unit tests (no database). Every password and secret here is random,
// made at run time, so nothing secret is written in this file.

const randomPassword = () => randomBytes(18).toString("base64url");
const randomSecret = () => randomBytes(32).toString("base64url");

describe("password hashing (lib/passwords.ts)", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const pw = randomPassword();
    const hash = await hashPassword(pw);
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword(`${pw}x`, hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password, and salts every hash differently", async () => {
    const pw = randomPassword();
    const [a, b] = await Promise.all([hashPassword(pw), hashPassword(pw)]);
    expect(a).not.toBe(b);
    expect(a).not.toContain(pw);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it("returns false (does not crash) for broken or foreign hash strings", async () => {
    const pw = randomPassword();
    for (const bad of ["", "scrypt$", "bcrypt$x$y", "scrypt$3$8$1$abc$def", "scrypt$16384$8$1$!!$!!", "plain-text"]) {
      expect(await verifyPassword(pw, bad)).toBe(false);
    }
  });

  it("refuses to hash an empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("session token (lib/session.ts)", () => {
  const secret = randomSecret();
  const staff = { staffId: randomUUID(), restaurantId: randomUUID(), role: "owner" as const };
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;

  it("round-trips staff id, restaurant id and role", () => {
    const s = verifySession(signSession(staff, now, secret), now, secret);
    expect(s).toMatchObject(staff);
    expect(s?.expiresAt).toBe(now + SESSION_HOURS * HOUR);
  });

  it("is valid just before 12 hours and rejected after", () => {
    const t = signSession(staff, now, secret);
    expect(verifySession(t, now + 12 * HOUR - 1000, secret)).not.toBeNull();
    expect(verifySession(t, now + 12 * HOUR + 1000, secret)).toBeNull();
  });

  it("rejects a tampered payload (e.g. switching to another restaurant)", () => {
    const [, sig] = signSession(staff, now, secret).split(".");
    const forged = Buffer.from(JSON.stringify({ sid: staff.staffId, rid: randomUUID(), role: "owner", exp: now + HOUR })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, now, secret)).toBeNull();
  });

  it("rejects a tampered signature, a different secret and badly formed tokens", () => {
    const t = signSession(staff, now, secret);
    const [payload, sig] = t.split(".");
    // Change a real BYTE in the middle of the signature (decode, flip, re-encode). Flipping the
    // last base64 character is not safe: its low bits are padding and can decode to the same bytes.
    // Repeated with fresh secrets so every possible signature is exercised, not one lucky one.
    for (let i = 0; i < 50; i++) {
      const s = randomSecret();
      const [p, g] = signSession(staff, now, s).split(".");
      const bytes = Buffer.from(g, "base64url");
      bytes[bytes.length >> 1] ^= 0xff;
      expect(verifySession(`${p}.${bytes.toString("base64url")}`, now, s), `round ${i}`).toBeNull();
      expect(verifySession(`${p}.${g}`, now, s), `untouched round ${i}`).not.toBeNull(); // the loop really tests tampering
    }    expect(verifySession(t, now, randomSecret())).toBeNull();
    for (const bad of [undefined, null, "", "garbage", "a.b.c", `${payload}.`, `.${sig}`, "123.bad"]) {
      expect(verifySession(bad, now, secret)).toBeNull();
    }
  });

  it("rejects a correctly signed token whose contents are wrong", () => {
    const sign = (data: unknown) => {
      // Build a token by hand with the real secret, to prove the contents are checked too.
      const p = Buffer.from(JSON.stringify(data)).toString("base64url");
      return `${p}.${createHmac("sha256", secret).update(p).digest("base64url")}`;
    };
    expect(verifySession(sign({ ...staff, sid: "not-a-uuid", rid: staff.restaurantId, exp: now + HOUR }), now, secret)).toBeNull();
    expect(verifySession(sign({ sid: staff.staffId, rid: staff.restaurantId, role: "admin", exp: now + HOUR }), now, secret)).toBeNull();
    expect(verifySession(sign({ sid: staff.staffId, rid: staff.restaurantId, role: "owner", exp: "soon" }), now, secret)).toBeNull();
    expect(verifySession(sign({ sid: staff.staffId, rid: staff.restaurantId, role: "staff", exp: now + HOUR }), now, secret)).not.toBeNull();
  });

  it("has NO fallback secret: missing or short SESSION_SECRET is a clear error", () => {
    expect(() => getSessionSecret("")).toThrow(/SESSION_SECRET is not set/);
    expect(() => getSessionSecret("short")).toThrow(/too short/);
    expect(() => signSession(staff, now, "")).toThrow(/SESSION_SECRET/);
    expect(() => verifySession("a.b", now, "")).toThrow(/SESSION_SECRET/);
  });

  it("role helper: an owner can do staff things, staff cannot do owner things", () => {
    const owner = verifySession(signSession({ ...staff, role: "owner" }, now, secret), now, secret)!;
    const member = verifySession(signSession({ ...staff, role: "staff" }, now, secret), now, secret)!;
    expect(hasRole(owner, "owner")).toBe(true);
    expect(hasRole(owner, "staff")).toBe(true);
    expect(hasRole(member, "staff")).toBe(true);
    expect(hasRole(member, "owner")).toBe(false);
  });
});
