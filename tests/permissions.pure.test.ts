import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ALL_CAPABILITIES, CAPABILITIES, STAFF_ROLES, can, type Capability, type StaffRole } from "@/lib/permissions";
import { hasRole, signSession, verifySession } from "@/lib/session";
import { GENERATED_PASSWORD_LENGTH, generatePassword } from "@/lib/passwords";
import { NEW_USERNAME } from "@/lib/staff-accounts";

// P8c: the one permissions map (lib/permissions.ts), checked capability by
// capability and role by role. Network-free.

const OWNER_ONLY: Capability[] = ["settings_edit", "staff_manage", "view_cost", "view_profit", "manage_expenses"];
const OWNER_MANAGER: Capability[] = [
  "menu_edit", "tables_edit", "cancel_order", "refund_payment", "void_item", "merge_tables", "clear_unpaid", "view_reports", "close_shift",
];
const EVERYONE: Capability[] = [
  "take_order", "take_payment", "apply_discount", "print_bill", "print_kot", "hold_order", "move_table", "seat_table", "update_order_status", "send_thankyou",
];

const expected: Record<StaffRole, Capability[]> = {
  owner: [...OWNER_ONLY, ...OWNER_MANAGER, ...EVERYONE],
  manager: [...OWNER_MANAGER, ...EVERYONE],
  staff: [...EVERYONE],
};

describe("permissions map", () => {
  it("has exactly the three roles and exactly the listed capabilities", () => {
    expect([...STAFF_ROLES]).toEqual(["owner", "manager", "staff"]);
    expect([...ALL_CAPABILITIES].sort()).toEqual([...OWNER_ONLY, ...OWNER_MANAGER, ...EVERYONE].sort());
    expect(Object.keys(CAPABILITIES)).toHaveLength(24);
  });

  for (const capability of [...OWNER_ONLY, ...OWNER_MANAGER, ...EVERYONE]) {
    for (const role of STAFF_ROLES) {
      const allowed = expected[role].includes(capability);
      it(`${role} ${allowed ? "may" : "may NOT"} ${capability}`, () => {
        expect(can(role, capability)).toBe(allowed);
      });
    }
  }

  it("unknown roles, a missing role and unknown capabilities are always refused", () => {
    expect(can(null, "take_order")).toBe(false);
    expect(can(undefined, "take_order")).toBe(false);
    expect(can("admin" as StaffRole, "take_order")).toBe(false);
    expect(can("owner", "launch_rockets" as Capability)).toBe(false);
    expect(can("owner", "toString" as Capability)).toBe(false);
  });
});

describe("login cookie with roles and session_version", () => {
  const secret = "x".repeat(43);
  const now = Date.now();
  const base = { staffId: randomUUID(), restaurantId: randomUUID() };

  it("a manager cookie is accepted, and hasRole ranks owner > manager > staff", () => {
    const manager = verifySession(signSession({ ...base, role: "manager" }, now, secret), now, secret)!;
    expect(manager.role).toBe("manager");
    expect(hasRole(manager, "staff")).toBe(true);
    expect(hasRole(manager, "manager")).toBe(true);
    expect(hasRole(manager, "owner")).toBe(false);
    const owner = verifySession(signSession({ ...base, role: "owner" }, now, secret), now, secret)!;
    expect(hasRole(owner, "manager")).toBe(true);
  });

  it("the session version travels in the cookie (default 1); a cookie from before P8c counts as version 1", () => {
    expect(verifySession(signSession({ ...base, role: "staff" }, now, secret), now, secret)!.sessionVersion).toBe(1);
    expect(verifySession(signSession({ ...base, role: "staff", sessionVersion: 7 }, now, secret), now, secret)!.sessionVersion).toBe(7);
    const sign = (data: object) => {
      const p = Buffer.from(JSON.stringify(data)).toString("base64url");
      return `${p}.${createHmac("sha256", secret).update(p, "utf8").digest().toString("base64url")}`;
    };
    const old = verifySession(sign({ sid: base.staffId, rid: base.restaurantId, role: "owner", exp: now + 60_000 }), now, secret);
    expect(old?.sessionVersion).toBe(1);
    expect(old?.mustChangePassword).toBe(false);
    for (const ver of [0, -1, 1.5, "2", null]) {
      expect(verifySession(sign({ sid: base.staffId, rid: base.restaurantId, role: "owner", ver, exp: now + 60_000 }), now, secret)).toBeNull();
    }
    expect(() => signSession({ ...base, role: "owner", sessionVersion: 0 }, now, secret)).toThrow();
  });
});

describe("generated passwords and new usernames", () => {
  it("generated passwords are long, from the safe alphabet, and different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });

  it("usernames: lower case, 3 to 30 characters, a-z 0-9 - _", () => {
    for (const ok of ["ali", "ali-till", "till_2", "a".repeat(30), "007"]) expect(NEW_USERNAME.test(ok)).toBe(true);
    for (const bad of ["al", "a".repeat(31), "Ali", "ali.till", "ali till", "-ali", "_ali", "ali@x", ""]) expect(NEW_USERNAME.test(bad)).toBe(false);
  });
});
