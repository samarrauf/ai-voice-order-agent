import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/passwords";
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, authenticateStaff } from "@/lib/staff-login";
import { RUN_MARKER, db } from "./helpers/helpers";

// Login rules against the real staff_accounts table (migration 0017), on TWO
// throwaway restaurants (names start with "vitest-run-"); the demo restaurant
// is never touched. Every password is random and made at run time.

const password = randomBytes(18).toString("base64url");
const wrong = randomBytes(18).toString("base64url");

let ridA: string;
let ridB: string;
let n = 0;

/** A fresh account in restaurant A (or B), so each test starts from a clean counter. */
async function makeAccount(overrides: Record<string, unknown> = {}, restaurant: "A" | "B" = "A") {
  const username = `${RUN_MARKER}-${++n}`.toLowerCase();
  const { data, error } = await db
    .from("staff_accounts")
    .insert({
      restaurant_id: restaurant === "A" ? ridA : ridB,
      username,
      password_hash: await hashPassword(password),
      role: "staff",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, username };
}

const row = async (id: string) =>
  (await db.from("staff_accounts").select("failed_attempts, locked_until, last_login_at").eq("id", id).single()).data!;

beforeAll(async () => {
  const r = await db.from("restaurants").insert([{ name: `${RUN_MARKER}-login-A` }, { name: `${RUN_MARKER}-login-B` }]).select("id, name");
  if (r.error) throw r.error;
  ridA = r.data.find((x) => x.name.endsWith("-A"))!.id;
  ridB = r.data.find((x) => x.name.endsWith("-B"))!.id;
});

afterAll(async () => {
  // Accounts go with their restaurant (on delete cascade).
  const r = await db.from("restaurants").delete().in("id", [ridA, ridB]);
  if (r.error) throw r.error;
});

describe("staff login (lib/staff-login.ts)", () => {
  it("logs in with the right password and returns the account's restaurant and role", async () => {
    const a = await makeAccount({ role: "owner" });
    const result = await authenticateStaff(a.username, password);
    expect(result).toEqual({ ok: true, staff: { staffId: a.id, restaurantId: ridA, role: "owner" } });
    expect((await row(a.id)).last_login_at).not.toBeNull();
  });

  it("each account only ever gets its own restaurant", async () => {
    const b = await makeAccount({}, "B");
    const result = await authenticateStaff(b.username, password);
    expect(result.ok && result.staff.restaurantId).toBe(ridB);
  });

  it("username is case-insensitive and trimmed", async () => {
    const a = await makeAccount();
    expect((await authenticateStaff(`  ${a.username.toUpperCase()} `, password)).ok).toBe(true);
  });

  it("wrong password and unknown username give the SAME answer", async () => {
    const a = await makeAccount();
    const wrongPw = await authenticateStaff(a.username, wrong);
    const noUser = await authenticateStaff(`${RUN_MARKER}-nobody`, password);
    expect(wrongPw).toEqual({ ok: false, reason: "invalid" });
    expect(noUser).toEqual(wrongPw);
    expect((await row(a.id)).failed_attempts).toBe(1);
  });

  it("refuses empty or silly input without crashing", async () => {
    for (const [u, p] of [["", password], ["x", ""], [null, null], [123, {}], ["a".repeat(500), password]] as const) {
      expect(await authenticateStaff(u, p)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it(`locks after ${MAX_FAILED_ATTEMPTS} wrong passwords; then even the right password is refused`, async () => {
    const a = await makeAccount();
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      await authenticateStaff(a.username, wrong);
      expect((await row(a.id)).failed_attempts).toBe(i);
      expect((await row(a.id)).locked_until).toBeNull();
    }
    await authenticateStaff(a.username, wrong); // the 5th
    const locked = await row(a.id);
    expect(locked.locked_until).not.toBeNull();
    const minutes = (new Date(locked.locked_until!).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(LOCK_MINUTES - 1);
    expect(minutes).toBeLessThanOrEqual(LOCK_MINUTES);

    expect(await authenticateStaff(a.username, password)).toEqual({ ok: false, reason: "invalid" });
    // ...and after the lock runs out, the right password works and clears everything.
    const later = new Date(Date.now() + (LOCK_MINUTES + 1) * 60_000);
    expect((await authenticateStaff(a.username, password, later)).ok).toBe(true);
    expect(await row(a.id)).toMatchObject({ failed_attempts: 0, locked_until: null });
  });

  it("wrong guesses sent at the same moment all count (no free extra guesses)", async () => {
    const a = await makeAccount();
    await Promise.all([1, 2, 3].map(() => authenticateStaff(a.username, wrong)));
    expect((await row(a.id)).failed_attempts).toBe(3);
  });

  it("a successful login resets the failed-attempt counter", async () => {
    const a = await makeAccount();
    await authenticateStaff(a.username, wrong);
    await authenticateStaff(a.username, wrong);
    expect((await row(a.id)).failed_attempts).toBe(2);
    expect((await authenticateStaff(a.username, password)).ok).toBe(true);
    expect((await row(a.id)).failed_attempts).toBe(0);
  });

  it("an inactive account is refused, even with the right password", async () => {
    const a = await makeAccount({ is_active: false });
    expect(await authenticateStaff(a.username, password)).toEqual({ ok: false, reason: "invalid" });
  });

  it("the database refuses a plain-text password and an upper-case username", async () => {
    const plain = await db.from("staff_accounts").insert({ restaurant_id: ridA, username: `${RUN_MARKER}-plain`.toLowerCase(), password_hash: password, role: "staff" });
    expect(plain.error).not.toBeNull();
    const upper = await db
      .from("staff_accounts")
      .insert({ restaurant_id: ridA, username: `${RUN_MARKER}-UP`, password_hash: await hashPassword(password), role: "staff" });
    expect(upper.error).not.toBeNull();
  });
});
