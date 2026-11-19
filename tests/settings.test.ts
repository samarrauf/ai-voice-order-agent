import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as saveSettings } from "@/app/api/staff/settings/route";
import { SESSION_COOKIE } from "@/lib/session";
import { diffSettings, parseSettings } from "@/lib/settings";
import { RUN_MARKER, db, sessionToken } from "./helpers/helpers";

// P8b: the owner's Settings. Two throwaway restaurants (A and B); the demo
// restaurant is never touched. Needs migration 0019 (update_restaurant_settings_tx + settings_audit).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function save(body: unknown, role: "owner" | "staff" | null, rid: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) headers.cookie = `${SESSION_COOKIE}=${await sessionToken(rid, role)}`;
  const res = await saveSettings(new Request("http://localhost/api/staff/settings", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

let A: string;
let B: string;

const restaurant = async (id: string) => (await db.from("restaurants").select("*").eq("id", id).single()).data as Record<string, any>;
const auditRows = async (id: string) => (await db.from("settings_audit").select("*").eq("restaurant_id", id).order("created_at")).data ?? [];

const money = (over: Record<string, unknown> = {}) => ({
  delivery_fee: 3, min_order_value: 10, tax_rate_percent: 20,
  service_charge_percent: 10, service_charge_applies_to: "dine_in", max_discount_percent: 15, ...over,
});

beforeAll(async () => {
  const r = await db
    .from("restaurants")
    .insert([{ name: `${RUN_MARKER}-settings-A`, delivery_fee: 0 }, { name: `${RUN_MARKER}-settings-B`, delivery_fee: 0 }])
    .select("id, name");
  if (r.error) throw r.error;
  A = r.data.find((x) => x.name.endsWith("-A"))!.id;
  B = r.data.find((x) => x.name.endsWith("-B"))!.id;
});

afterAll(async () => {
  await db.from("restaurants").delete().in("id", [A, B]); // staff logins and audit rows go with them
});

describe("who may save settings", () => {
  it("no login -> 401, staff login -> 403, and nothing changes", async () => {
    const body = { section: "money", values: money({ delivery_fee: 9 }) };
    expect((await save(body, null, A)).status).toBe(401);
    expect((await save(body, "staff", A)).status).toBe(403);
    expect(Number((await restaurant(A)).delivery_fee)).toBe(0);
    expect(await auditRows(A)).toHaveLength(0);
  });
});

describe("saving a section", () => {
  it("money: saves, and writes one audit row with the old and new values", async () => {
    const r = await save({ section: "money", values: money() }, "owner", A);
    expect(r.status).toBe(200);
    expect(r.json.changed).toEqual(expect.arrayContaining(["delivery_fee", "min_order_value", "tax_rate_percent"]));
    const row = await restaurant(A);
    expect(Number(row.delivery_fee)).toBe(3);
    expect(Number(row.tax_rate_percent)).toBe(20);
    expect(row.service_charge_applies_to).toBe("dine_in");

    const audit = await auditRows(A);
    expect(audit).toHaveLength(1);
    expect(audit[0].section).toBe("money");
    expect(audit[0].username).toMatch(/^vitest-run-/);
    expect(audit[0].changes.delivery_fee).toEqual({ from: 0, to: 3 });
  });

  it("saving the same values again changes nothing and leaves no new audit row", async () => {
    const r = await save({ section: "money", values: money() }, "owner", A);
    expect(r.status).toBe(200);
    expect(r.json.changed).toEqual([]);
    expect(await auditRows(A)).toHaveLength(1);
  });

  it("profile: blanks become null, instagram gets its @, hex colours are upper-cased", async () => {
    const p = await save(
      {
        section: "profile",
        values: {
          name: `${RUN_MARKER}-settings-A`, tagline: "  Fresh daily ", parent_group_name: "", phone: "0161 000 0000", whatsapp_number: "",
          address_line: "1 Test Street", city: "Manchester", postcode: "M1 1AA", website_url: "https://example.com",
          instagram_handle: "napoli_test", facebook_url: "", receipt_footer_note: "Thank you!",
        },
      },
      "owner",
      A,
    );
    expect(p.status).toBe(200);
    const row = await restaurant(A);
    expect(row).toMatchObject({ tagline: "Fresh daily", parent_group_name: null, instagram_handle: "@napoli_test", facebook_url: null });

    const t = await save(
      { section: "theme", values: { theme_primary: "#3e5030", theme_accent: "#c9a227", theme_secondary: "#64748B", theme_background: "#FFFFFF", theme_text: "#1A1A1A" } },
      "owner",
      A,
    );
    expect(t.status).toBe(200);
    expect(await restaurant(A)).toMatchObject({ theme_primary: "#3E5030", theme_accent: "#C9A227" });
  });

  it("orders: the switch turns is_accepting_orders off and on", async () => {
    expect((await save({ section: "orders", values: { is_accepting_orders: false } }, "owner", A)).status).toBe(200);
    expect((await restaurant(A)).is_accepting_orders).toBe(false);
    expect((await save({ section: "orders", values: { is_accepting_orders: true } }, "owner", A)).status).toBe(200);
    expect((await restaurant(A)).is_accepting_orders).toBe(true);
  });
});

describe("bad input is refused (400) and nothing is saved", () => {
  const before = async () => (await auditRows(A)).length;
  it.each([
    ["negative delivery fee", { section: "money", values: money({ delivery_fee: -1 }) }],
    ["tax over 100", { section: "money", values: money({ tax_rate_percent: 101 }) }],
    ["text as a number", { section: "money", values: money({ delivery_fee: "3" }) }],
    ["currency in the body (read-only)", { section: "money", values: money({ currency: "GBP" }) }],
    ["timezone in the body (read-only)", { section: "profile", values: { name: "X", timezone: "Europe/London" } }],
    ["a different currency", { section: "money", values: money({ currency: "USD" }) }],
    ["a different timezone", { section: "profile", values: { name: "X", timezone: "Asia/Karachi" } }],
    ["bad service charge option", { section: "money", values: money({ service_charge_applies_to: "sometimes" }) }],
    ["bad hex colour", { section: "theme", values: { theme_primary: "red", theme_accent: "#3B82F6", theme_secondary: "#64748B", theme_background: "#FFFFFF", theme_text: "#1A1A1A" } }],
    ["missing colour", { section: "theme", values: { theme_primary: "#3B82F6" } }],
    ["unknown section", { section: "billing", values: {} }],
    ["is_accepting_orders as text", { section: "orders", values: { is_accepting_orders: "yes" } }],
    ["a field that is not a setting (restaurant id)", { section: "orders", values: { is_accepting_orders: true, id: "11111111-1111-1111-1111-111111111111" } }],
    ["a javascript: web address", { section: "profile", values: { name: "X", website_url: "javascript:alert(1)" } }],
    ["empty name", { section: "profile", values: { name: "  " } }],
  ])("%s", async (_n, body) => {
    const count = await before();
    const r = await save(body, "owner", A);
    expect(r.status).toBe(400);
    expect(await auditRows(A)).toHaveLength(count);
  });
});

// An account id of restaurant `rid` with this role (made on first use by sessionToken).
const accountOf = async (rid: string, role: "owner" | "staff") => {
  await sessionToken(rid, role);
  return (await db.from("staff_accounts").select("id").eq("restaurant_id", rid).eq("role", role).limit(1).single()).data!.id as string;
};

describe("currency and timezone are read-only", () => {
  it("a 400 says so, and the stored currency and timezone never change", async () => {
    const before = await restaurant(A);
    const c = await save({ section: "money", values: money({ currency: "USD" }) }, "owner", A);
    const z = await save({ section: "profile", values: { name: "X", timezone: "Asia/Karachi" } }, "owner", A);
    expect(c.status).toBe(400);
    expect(c.json.details[0]).toMatch(/currency: read-only/);
    expect(z.status).toBe(400);
    expect(z.json.details[0]).toMatch(/timezone: read-only/);
    const after = await restaurant(A);
    expect([after.currency, after.timezone]).toEqual([before.currency, before.timezone]);
  });

  it("even a direct call of the database function refuses them (bad_field)", async () => {
    const staffId = await accountOf(A, "owner");
    for (const [section, values] of [["money", { currency: "USD" }], ["profile", { timezone: "Asia/Karachi" }]] as const) {
      const r = await db.rpc("update_restaurant_settings_tx", { p_restaurant_id: A, p_staff_id: staffId, p_section: section, p_values: values });
      expect(r.data).toMatchObject({ ok: false, error: "bad_field" });
    }
  });
});

describe("the save and its audit row are one transaction (update_restaurant_settings_tx)", () => {
  const call = (args: Record<string, unknown>) => db.rpc("update_restaurant_settings_tx", args as never);

  it("a value the database refuses (negative fee) rolls everything back: no setting, no audit row", async () => {
    const before = await restaurant(A);
    const rows = (await auditRows(A)).length;
    const r = await call({ p_restaurant_id: A, p_staff_id: await accountOf(A, "owner"), p_section: "money", p_values: { tax_rate_percent: 5, delivery_fee: -1 } });
    expect(r.error).not.toBeNull();
    const after = await restaurant(A);
    expect(Number(after.tax_rate_percent)).toBe(Number(before.tax_rate_percent)); // the fine field in the same save was undone too
    expect(Number(after.delivery_fee)).toBe(Number(before.delivery_fee));
    expect(await auditRows(A)).toHaveLength(rows);
  });

  it("a staff, unknown, switched-off or other-restaurant account is refused (not_allowed), nothing saved", async () => {
    const before = Number((await restaurant(A)).tax_rate_percent);
    const rows = (await auditRows(A)).length;
    const off = randomUUID();
    const made = await db
      .from("staff_accounts")
      .insert({ id: off, restaurant_id: A, username: `${RUN_MARKER}-tx-off`, password_hash: "scrypt$test-only", role: "owner", is_active: false });
    if (made.error) throw made.error;
    for (const staff of [await accountOf(A, "staff"), randomUUID(), off, await accountOf(B, "owner")]) {
      const r = await call({ p_restaurant_id: A, p_staff_id: staff, p_section: "money", p_values: { tax_rate_percent: 33 } });
      expect(r.data).toMatchObject({ ok: false, error: "not_allowed" });
    }
    expect(Number((await restaurant(A)).tax_rate_percent)).toBe(before);
    expect(await auditRows(A)).toHaveLength(rows);
  });

  it("an unknown section or field is refused", async () => {
    const id = await accountOf(A, "owner");
    expect((await call({ p_restaurant_id: A, p_staff_id: id, p_section: "billing", p_values: {} })).data).toMatchObject({ error: "bad_section" });
    expect((await call({ p_restaurant_id: A, p_staff_id: id, p_section: "orders", p_values: { id: B } })).data).toMatchObject({ error: "bad_field" });
  });

  it("the browser (anon) key is refused (permission denied or not_allowed), and no row changes", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const id = await accountOf(A, "owner");
    const before = await restaurant(A);
    const rows = (await auditRows(A)).length;
    const r = await anon.rpc("update_restaurant_settings_tx", { p_restaurant_id: A, p_staff_id: id, p_section: "money", p_values: { tax_rate_percent: 44 } });
    // After migration 0020 this is a "permission denied" error; before it, the function itself said not_allowed. Never a save.
    const denied = r.error !== null || (r.data as { ok?: boolean } | null)?.ok === false;
    expect(denied).toBe(true);
    if (r.error) expect(r.error.message).toMatch(/permission denied/i);
    expect(await restaurant(A)).toEqual(before); // not one column changed
    expect(await auditRows(A)).toHaveLength(rows); // and no audit row
  });

  it("two saves at the same moment both land, each with its own audit row", async () => {
    const id = await accountOf(A, "owner");
    const rows = (await auditRows(A)).length;
    const [x, y] = await Promise.all([
      call({ p_restaurant_id: A, p_staff_id: id, p_section: "money", p_values: { max_discount_percent: 11 } }),
      call({ p_restaurant_id: A, p_staff_id: id, p_section: "money", p_values: { service_charge_percent: 12 } }),
    ]);
    expect(x.data).toMatchObject({ ok: true });
    expect(y.data).toMatchObject({ ok: true });
    expect(await auditRows(A)).toHaveLength(rows + 2);
  });
});

describe("tenancy: the restaurant always comes from the login", () => {
  it("an owner of A cannot change B, even with B's id in the body", async () => {
    const r = await save({ restaurant_id: B, section: "money", values: money({ delivery_fee: 77 }) }, "owner", A);
    expect(r.status).toBe(200);
    expect(Number((await restaurant(A)).delivery_fee)).toBe(77);
    expect(Number((await restaurant(B)).delivery_fee)).toBe(0);
    expect(await auditRows(B)).toHaveLength(0);
  });
});

describe("lib/settings: parse and diff", () => {
  it("rounds money to 2 decimals", () => {
    const r = parseSettings({ section: "money", values: money({ delivery_fee: 2.499 }) });
    expect(r.ok && r.data.values.delivery_fee).toBe(2.5);
  });
  it("diffSettings compares numbers and numeric strings as numbers, and null with undefined", () => {
    expect(diffSettings({ delivery_fee: "2.50", tagline: null }, { delivery_fee: 2.5, tagline: null })).toEqual({});
    expect(diffSettings({ delivery_fee: "2.50" }, { delivery_fee: 3 })).toEqual({ delivery_fee: { from: "2.50", to: 3 } });
  });
});
