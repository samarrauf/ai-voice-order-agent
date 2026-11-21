import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as accountsRoute } from "@/app/api/staff/accounts/route";
import { POST as passwordRoute } from "@/app/api/staff/password/route";
import { POST as settingsRoute } from "@/app/api/staff/settings/route";
import { login } from "@/app/dashboard/login/actions";
import PasswordPage from "@/app/dashboard/password/page";
import SettingsPage from "@/app/dashboard/settings/page";
import StaffPage from "@/app/dashboard/staff/page";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { SESSION_COOKIE, signSession, verifySession, type StaffRole } from "@/lib/session";
import { requireStaff } from "@/lib/staff-auth";
import { MAX_FAILED_ATTEMPTS, authenticateStaff, loadLoginState } from "@/lib/staff-login";
import { requireStaffPage } from "@/lib/staff-page";
import { RUN_MARKER, db, sessionToken } from "./helpers/helpers";

// P8c: staff management, manager role, session_version and must_change_password.
// Only throwaway restaurants (names "vitest-run-..."); Napoli and Olive are never
// touched. Needs migration 0023.

// Pages and the login action read/write the login cookie through next/headers; give them ours.
const jar = vi.hoisted(() => ({ value: undefined as string | undefined, set: [] as { name: string; value: string }[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "staff_session" && jar.value ? { name, value: jar.value } : undefined),
    set: (name: string, value: string) => {
      jar.set.push({ name, value });
    },
  }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
type Handler = (req: Request) => Promise<Response>;
async function call(handler: Handler, body: unknown, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await handler(new Request("http://localhost/api/staff/test", { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as Record<string, any>, setCookie: res.headers.get("set-cookie") };
}
const manage = (body: unknown, cookie: string | null) => call(accountsRoute, body, cookie);
const tokenOf = (cookie: string) => cookie.slice(SESSION_COOKIE.length + 1);
const cookieFromSetCookie = (setCookie: string | null) => {
  const first = (setCookie ?? "").split(";")[0];
  expect(first.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
  return first;
};
const check = (cookie: string) => requireStaff(new Request("http://localhost/api/staff/x", { headers: { cookie } }));

/** The path a page/action redirected to, or null if it did not redirect. */
async function redirectTarget(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw e;
  }
}

const newName = () => `vt-${randomBytes(5).toString("hex")}`;
const ids: string[] = [];

async function restaurant(label: string) {
  const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-staff-${label}` }).select("id").single();
  if (r.error) throw r.error;
  ids.push(r.data.id);
  return r.data.id as string;
}

async function makeAccount(rid: string, role: StaffRole, opts: { password?: string; mustChange?: boolean } = {}) {
  const id = randomUUID();
  const username = `${RUN_MARKER}-sm-${id.slice(0, 8)}`;
  const r = await db.from("staff_accounts").insert({
    id,
    restaurant_id: rid,
    username,
    password_hash: opts.password ? await hashPassword(opts.password) : "scrypt$test-only",
    role,
    must_change_password: opts.mustChange ?? false,
  });
  if (r.error) throw r.error;
  return { id, username, cookie: `${SESSION_COOKIE}=${await sessionToken(rid, role, id)}` };
}

const account = async (id: string) => (await db.from("staff_accounts").select("*").eq("id", id).single()).data as Record<string, any>;
const events = async (rid: string) =>
  ((await db.from("staff_account_events").select("*").eq("restaurant_id", rid).order("created_at")).data ?? []) as Record<string, any>[];

/** Logs in with username + password the way the login page does; returns what goes into the new cookie. */
async function freshLogin(username: string, password: string) {
  const r = await authenticateStaff(username, password);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("login failed");
  return { state: (await loadLoginState(r.staff.staffId))! };
}

let A: string;
let B: string;
let ownerA: Awaited<ReturnType<typeof makeAccount>>;
let managerA: Awaited<ReturnType<typeof makeAccount>>;
let staffA: Awaited<ReturnType<typeof makeAccount>>;
let ownerB: Awaited<ReturnType<typeof makeAccount>>;
let staffB: Awaited<ReturnType<typeof makeAccount>>;

beforeAll(async () => {
  A = await restaurant("A");
  B = await restaurant("B");
  ownerA = await makeAccount(A, "owner");
  managerA = await makeAccount(A, "manager");
  staffA = await makeAccount(A, "staff");
  ownerB = await makeAccount(B, "owner");
  staffB = await makeAccount(B, "staff");
});

afterAll(async () => {
  jar.value = undefined;
  if (ids.length) await db.from("restaurants").delete().in("id", ids); // logins and events go with them
});

describe("who may manage staff and settings", () => {
  it("no login -> 401; staff and manager -> 403 on the Staff API; nothing is created", async () => {
    const username = newName();
    const body = { action: "create", username, role: "staff" };
    expect((await manage(body, null)).status).toBe(401);
    expect((await manage(body, staffA.cookie)).status).toBe(403);
    expect((await manage(body, managerA.cookie)).status).toBe(403);
    expect((await db.from("staff_accounts").select("id").eq("username", username)).data).toHaveLength(0);
  });

  it("manager -> 403 on the Settings API", async () => {
    const r = await call(settingsRoute, { section: "orders", values: { is_accepting_orders: true } }, managerA.cookie);
    expect(r.status).toBe(403);
  });

  it("the Staff and Settings pages send manager and staff back to /dashboard; the owner gets in", async () => {
    for (const who of [managerA, staffA]) {
      jar.value = tokenOf(who.cookie);
      expect(await redirectTarget(() => StaffPage())).toBe("/dashboard");
      expect(await redirectTarget(() => SettingsPage())).toBe("/dashboard");
    }
    jar.value = tokenOf(ownerA.cookie);
    expect(await redirectTarget(() => StaffPage())).toBeNull();
    expect(await redirectTarget(() => SettingsPage())).toBeNull();
  });
});

describe("a new password is shown once and never stored or logged as it is", () => {
  it("create and reset: the password is in that one response only, the DB has just its hash, logs never contain it", async () => {
    const logged: unknown[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void logged.push(...args)),
    );
    try {
      const username = newName();
      const created = await manage({ action: "create", username: username.toUpperCase(), role: "manager" }, ownerA.cookie);
      expect(created.status).toBe(200);
      expect(created.json.username).toBe(username); // stored in lower case
      const password = created.json.password as string;
      expect(password).toHaveLength(16);
      expect(created.text.split(password).length - 1).toBe(1);

      const row = await account(created.json.staff_id);
      expect(row).toMatchObject({ restaurant_id: A, username, role: "manager", is_active: true, must_change_password: true, session_version: 1 });
      expect(row.password_hash.startsWith("scrypt$")).toBe(true);
      expect(row.password_hash.includes(password)).toBe(false);
      expect(await verifyPassword(password, row.password_hash)).toBe(true);

      const reset = await manage({ action: "reset_password", staff_id: row.id }, ownerA.cookie);
      expect(reset.status).toBe(200);
      const second = reset.json.password as string;
      expect(second).toHaveLength(16);
      expect(second).not.toBe(password);
      const after = await account(row.id);
      expect(await verifyPassword(second, after.password_hash)).toBe(true);
      expect(await verifyPassword(password, after.password_hash)).toBe(false);

      // A later action on the same login never sends a password again.
      const later = await manage({ action: "set_role", staff_id: row.id, role: "staff" }, ownerA.cookie);
      expect(later.status).toBe(200);
      expect(later.json.password).toBeUndefined();
      expect(later.text.includes(second)).toBe(false);

      const evs = JSON.stringify(await events(A));
      const everything = JSON.stringify([evs, after, logged.map((x) => (typeof x === "string" ? x : String(x)))]);
      for (const p of [password, second]) expect(everything.includes(p)).toBe(false);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe("usernames", () => {
  it("must be 3-30 of a-z 0-9 - _, globally unique, with a known role; extra fields are refused", async () => {
    for (const username of ["ab", "a".repeat(31), "has space", "dot.name", "-dash", "emoji😀"]) {
      const r = await manage({ action: "create", username, role: "staff" }, ownerA.cookie);
      expect(r.status, username).toBe(400);
    }
    expect((await manage({ action: "create", username: newName(), role: "admin" }, ownerA.cookie)).status).toBe(400);
    expect((await manage({ action: "create", username: newName(), role: "staff", password: "x" }, ownerA.cookie)).status).toBe(400);

    const taken = newName();
    expect((await manage({ action: "create", username: taken, role: "staff" }, ownerB.cookie)).status).toBe(200);
    const again = await manage({ action: "create", username: taken, role: "staff" }, ownerA.cookie);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("username_taken");
    expect((await db.from("staff_accounts").select("restaurant_id").eq("username", taken)).data).toEqual([{ restaurant_id: B }]);
  });
});

describe("tenancy: an owner of A can do nothing to B's logins", () => {
  it("every action on a login of B is 'not found' and changes nothing; a body restaurant_id of B is 403", async () => {
    const before = await account(staffB.id);
    const eventsBefore = (await events(B)).length;
    for (const body of [
      { action: "set_role", staff_id: staffB.id, role: "owner" },
      { action: "deactivate", staff_id: staffB.id },
      { action: "activate", staff_id: staffB.id },
      { action: "reset_password", staff_id: staffB.id },
    ]) {
      const r = await manage(body, ownerA.cookie);
      expect(r.status, body.action).toBe(404);
      expect(r.json.password).toBeUndefined();
    }
    expect(await account(staffB.id)).toEqual(before);
    expect(await events(B)).toHaveLength(eventsBefore);

    const r = await manage({ action: "create", username: newName(), role: "staff", restaurant_id: B }, ownerA.cookie);
    expect(r.status).toBe(403);
    expect((await manage({ action: "set_role", staff_id: staffA.id, role: "staff", restaurant_id: A }, ownerA.cookie)).status).toBe(200);
  });

  it("the database function itself refuses a non-owner or an owner of another restaurant", async () => {
    for (const actor of [ownerB.id, managerA.id, staffA.id]) {
      const { data, error } = await db.rpc("manage_staff_account_tx", {
        p_restaurant_id: A, p_actor_id: actor, p_action: "deactivate", p_target_id: staffA.id,
      });
      expect(error).toBeNull();
      expect(data).toEqual({ ok: false, error: "not_allowed" });
    }
    expect((await account(staffA.id)).is_active).toBe(true);
  });
});

describe("the last active owner is protected", () => {
  it("can't be switched off or demoted; owners can't change their own role; a second owner makes it possible", async () => {
    const L = await restaurant("L");
    const owner1 = await makeAccount(L, "owner");

    for (const body of [{ action: "deactivate", staff_id: owner1.id }, { action: "set_role", staff_id: owner1.id, role: "manager" }]) {
      const r = await manage(body, owner1.cookie);
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("last_owner");
    }
    expect(await account(owner1.id)).toMatchObject({ role: "owner", is_active: true, session_version: 1 });

    // A second owner: created with a one-time password, which they must change first.
    const created = await manage({ action: "create", username: newName(), role: "owner" }, owner1.cookie);
    expect(created.status).toBe(200);
    const owner2Id = created.json.staff_id as string;
    const login2 = await freshLogin(created.json.username, created.json.password);
    expect(login2.state).toEqual({ sessionVersion: 1, mustChangePassword: true });
    const owner2Cookie = `${SESSION_COOKIE}=${await sessionToken(L, "owner", owner2Id)}`;
    const blocked = await manage({ action: "deactivate", staff_id: owner1.id }, owner2Cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toBe("password_change_required");
    const changed = await call(passwordRoute, { current_password: created.json.password, new_password: "owner-two-new-pass" }, owner2Cookie);
    expect(changed.status).toBe(200);
    const owner2 = cookieFromSetCookie(changed.setCookie);

    // Own role / own switch-off: refused even now that another owner exists.
    for (const body of [{ action: "set_role", staff_id: owner1.id, role: "manager" }, { action: "deactivate", staff_id: owner1.id }]) {
      const r = await manage(body, owner1.cookie);
      expect(r.status).toBe(409);
      expect(r.json.error).toBe("self");
    }

    // The other owner may demote owner1; owner1's open session ends at once (401, not just 403).
    expect((await manage({ action: "set_role", staff_id: owner1.id, role: "manager" }, owner2)).status).toBe(200);
    expect((await check(owner1.cookie)).ok).toBe(false);
    expect(((await check(owner1.cookie)) as { response: Response }).response.status).toBe(401);

    // Now owner2 is the last owner.
    for (const body of [{ action: "deactivate", staff_id: owner2Id }, { action: "set_role", staff_id: owner2Id, role: "staff" }]) {
      const r = await manage(body, owner2);
      expect(r.json.error).toBe("last_owner");
    }
    const kinds = (await events(L)).map((e) => e.event);
    expect(kinds).toEqual(["created", "password_changed", "role_changed"]);
  });
});

describe("password reset, switch-off and role change end old sessions at once", () => {
  it("each one raises session_version; a cookie made before it gets 401; a fresh login works", async () => {
    const password = "staff-member-pass-1";
    const s = await makeAccount(A, "staff", { password });
    expect((await check(s.cookie)).ok).toBe(true);

    // Switch off, then on again: the old cookie stays dead.
    expect((await manage({ action: "deactivate", staff_id: s.id }, ownerA.cookie)).status).toBe(200);
    expect((await check(s.cookie)).ok).toBe(false);
    expect((await manage({ action: "activate", staff_id: s.id }, ownerA.cookie)).status).toBe(200);
    expect((await check(s.cookie)).ok).toBe(false);
    const v2 = (await freshLogin(s.username, password)).state;
    expect(v2).toEqual({ sessionVersion: 2, mustChangePassword: false });

    // Role change ends the version-2 session.
    const v2Cookie = `${SESSION_COOKIE}=${signSession({ staffId: s.id, restaurantId: A, role: "staff", sessionVersion: 2 })}`;
    expect((await check(v2Cookie)).ok).toBe(true);
    expect((await manage({ action: "set_role", staff_id: s.id, role: "manager" }, ownerA.cookie)).status).toBe(200);
    expect((await check(v2Cookie)).ok).toBe(false);

    // Reset ends the version-3 session, and the old password stops working.
    const v3Cookie = `${SESSION_COOKIE}=${signSession({ staffId: s.id, restaurantId: A, role: "manager", sessionVersion: 3 })}`;
    expect((await check(v3Cookie)).ok).toBe(true);
    const reset = await manage({ action: "reset_password", staff_id: s.id }, ownerA.cookie);
    expect(reset.status).toBe(200);
    const r3 = await check(v3Cookie);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.response.status).toBe(401);
    expect((await authenticateStaff(s.username, password)).ok).toBe(false);
    expect((await freshLogin(s.username, reset.json.password)).state).toEqual({ sessionVersion: 4, mustChangePassword: true });

    const kinds = (await events(A)).filter((e) => e.target_staff_id === s.id).map((e) => e.event);
    expect(kinds).toEqual(["deactivated", "activated", "role_changed", "password_reset"]);
  });
});

describe("must_change_password", () => {
  it("login goes straight to the password page; the rest of the dashboard and the API stay closed until it is changed", async () => {
    const given = "given-by-owner-1";
    const m = await makeAccount(A, "staff", { password: given, mustChange: true });

    const form = (password: string) => {
      const f = new FormData();
      f.set("username", m.username);
      f.set("password", password);
      return f;
    };
    jar.set = [];
    expect(await redirectTarget(() => login({ error: null, username: "" }, form(given)))).toBe("/dashboard/password");
    expect(jar.set).toHaveLength(1);
    const token = jar.set[0].value;
    expect(verifySession(token)?.sessionVersion).toBe(1);
    const cookie = `${SESSION_COOKIE}=${token}`;

    jar.value = token;
    expect(await redirectTarget(() => requireStaffPage())).toBe("/dashboard/password");
    expect(await redirectTarget(() => StaffPage())).toBe("/dashboard/password");
    expect((await requireStaffPage({ allowPasswordChange: true })).mustChangePassword).toBe(true);
    expect(await redirectTarget(() => PasswordPage())).toBeNull();
    const api = await check(cookie);
    expect(api.ok).toBe(false);
    if (!api.ok) expect((await api.response.json()).error).toBe("password_change_required");

    // Bad attempts change nothing.
    for (const [body, error] of [
      [{ current_password: "wrong-one-123", new_password: "brand-new-pass-1" }, "wrong_current_password"],
      [{ current_password: given, new_password: "short-9ch" }, "invalid request"],
      [{ current_password: given, new_password: given }, "same_password"],
    ] as const) {
      const r = await call(passwordRoute, body, cookie);
      expect(r.status).toBe(400);
      expect(r.json.error).toBe(error);
      expect(r.setCookie).toBeNull();
    }
    expect(await account(m.id)).toMatchObject({ must_change_password: true, session_version: 1 });

    // The real change: this browser gets a new cookie, the old one dies, the dashboard opens.
    const ok = await call(passwordRoute, { current_password: given, new_password: "brand-new-pass-1" }, cookie);
    expect(ok.status).toBe(200);
    expect(ok.text.includes("brand-new-pass-1")).toBe(false);
    const fresh = cookieFromSetCookie(ok.setCookie);
    expect((await check(cookie)).ok).toBe(false);
    const now = await check(fresh);
    expect(now.ok).toBe(true);
    if (now.ok) expect(now.staff.mustChangePassword).toBe(false);
    expect(await account(m.id)).toMatchObject({ must_change_password: false, session_version: 2 });

    jar.set = [];
    expect(await redirectTarget(() => login({ error: null, username: "" }, form("brand-new-pass-1")))).toBe("/dashboard");
    expect((await authenticateStaff(m.username, given)).ok).toBe(false);
    expect((await events(A)).filter((e) => e.target_staff_id === m.id).map((e) => e.event)).toEqual(["password_changed"]);
  });
});

describe("login lockout (unchanged behaviour)", () => {
  it(`${MAX_FAILED_ATTEMPTS} wrong passwords lock the account even for the right password; an owner reset lifts the lock`, async () => {
    const password = "lockout-test-pass";
    const k = await makeAccount(A, "staff", { password });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) expect((await authenticateStaff(k.username, "not-the-password")).ok).toBe(false);
    expect(await authenticateStaff(k.username, password)).toEqual({ ok: false, reason: "invalid" });
    expect((await account(k.id)).locked_until).not.toBeNull();

    const reset = await manage({ action: "reset_password", staff_id: k.id }, ownerA.cookie);
    expect(reset.status).toBe(200);
    expect((await authenticateStaff(k.username, reset.json.password)).ok).toBe(true);
  });
});

describe("the staff functions are closed to the browser's anon key", () => {
  it("manage_staff_account_tx and change_own_password_tx: permission denied, nothing changes", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const before = await account(staffA.id);
    const manage = await anon.rpc("manage_staff_account_tx", {
      p_restaurant_id: A, p_actor_id: ownerA.id, p_action: "deactivate", p_target_id: staffA.id,
    });
    const own = await anon.rpc("change_own_password_tx", {
      p_restaurant_id: A, p_staff_id: staffA.id, p_expected_hash: before.password_hash, p_new_hash: "scrypt$anon-attempt",
    });
    for (const r of [manage, own]) {
      expect(r.data).toBeNull();
      expect(r.error?.code).toBe("42501");
      expect(r.error?.message).toMatch(/permission denied for function/);
    }
    expect(await account(staffA.id)).toEqual(before);
  });
});

describe("change-password page uses the login lock-out", () => {
  it("5 wrong current passwords lock the login (429) even for the right one; other logins are untouched; after the lock it works", async () => {
    const password = "lock-page-pass-1";
    const p = await makeAccount(A, "staff", { password });
    const sameRestaurant = await makeAccount(A, "staff", { password });
    const otherRestaurant = await makeAccount(B, "staff", { password });
    const tryChange = (current: string) => call(passwordRoute, { current_password: current, new_password: "the-new-pass-123" }, p.cookie);

    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      const r = await tryChange("wrong-pass-xyz");
      expect(r.status, `try ${i}`).toBe(400);
      expect(r.json.error).toBe("wrong_current_password");
    }
    const fifth = await tryChange("wrong-pass-xyz");
    expect(fifth.status).toBe(429);
    expect(fifth.json.error).toBe("locked");
    expect(fifth.json.message).toMatch(/locked for 15 minutes/);

    const right = await tryChange(password);
    expect(right.status).toBe(429);
    expect(right.json.error).toBe("locked");
    expect(right.setCookie).toBeNull();
    expect(await authenticateStaff(p.username, password)).toEqual({ ok: false, reason: "invalid" }); // the same lock as login
    const locked = await account(p.id);
    expect(locked.locked_until).not.toBeNull();
    expect(await verifyPassword(password, locked.password_hash)).toBe(true); // nothing was changed

    for (const other of [sameRestaurant, otherRestaurant]) {
      expect(await account(other.id)).toMatchObject({ failed_attempts: 0, locked_until: null });
      expect((await authenticateStaff(other.username, password)).ok).toBe(true);
    }

    // When the lock has run out the right password works again.
    await db.from("staff_accounts").update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq("id", p.id);
    expect((await tryChange(password)).status).toBe(200);
  });

  it("the right current password clears earlier wrong tries", async () => {
    const password = "reset-count-pass-1";
    const r = await makeAccount(A, "staff", { password });
    for (let i = 0; i < 3; i++) {
      expect((await call(passwordRoute, { current_password: "nope-nope-1", new_password: "another-pass-123" }, r.cookie)).status).toBe(400);
    }
    expect((await account(r.id)).failed_attempts).toBe(3);
    expect((await call(passwordRoute, { current_password: password, new_password: "another-pass-123" }, r.cookie)).status).toBe(200);
    expect(await account(r.id)).toMatchObject({ failed_attempts: 0, locked_until: null });
  });
});

describe("Staff page events", () => {
  it("shows this restaurant's last 20 events, newest first, and no password data", async () => {
    const E = await restaurant("E");
    const owner = await makeAccount(E, "owner");
    const member = await makeAccount(E, "staff");
    for (let i = 0; i < 11; i++) {
      expect((await manage({ action: "deactivate", staff_id: member.id }, owner.cookie)).status).toBe(200);
      expect((await manage({ action: "activate", staff_id: member.id }, owner.cookie)).status).toBe(200);
    }
    expect(await events(E)).toHaveLength(22);

    jar.value = tokenOf(owner.cookie);
    const page = await StaffPage();
    const find = (node: any): any => {
      if (!node || typeof node !== "object") return null;
      if (node.props?.events && node.props?.accounts) return node.props;
      const kids = node.props?.children;
      for (const k of Array.isArray(kids) ? kids : [kids]) {
        const hit = find(k);
        if (hit) return hit;
      }
      return null;
    };
    const props = find(page);
    expect(props.events).toHaveLength(20);
    expect(props.events[0].event).toBe("activated");
    expect(props.events[1].event).toBe("deactivated");
    expect(props.accounts.map((a: any) => a.id).sort()).toEqual([owner.id, member.id].sort());
    expect(JSON.stringify(props).includes("password_hash")).toBe(false);
    expect(JSON.stringify(props).includes("scrypt$")).toBe(false);
  });
});
