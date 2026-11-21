import { describe, expect, it, vi } from "vitest";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import PrintBillPage from "@/app/dashboard/print/bill/[orderId]/page";
import PrintKotPage from "@/app/dashboard/print/kot/[orderId]/page";
import { menu } from "@/data/sites/olive-n-spice/menu";
import { checkOpen, type OpeningHours } from "@/lib/opening-hours";
import { BILL_SETTINGS_SELECT, computeBill, type BillSettingsRow } from "@/lib/order-pricing";
import { signSession } from "@/lib/session";
import { db, RID as NAPOLI } from "./helpers/helpers";

// P9b: Olive 'n Spice onboarding. READ-ONLY against the live database: the seed
// (supabase/seed/olive-n-spice.sql) is never re-run here, and no order is ever
// created for Olive. Napoli is only read.

const OLIVE = "22222222-2222-2222-2222-222222222222";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "staff_session" && cookieJar.value ? { name, value: cookieJar.value } : undefined),
  }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
async function oliveCookie(): Promise<string> {
  // The REAL olive-owner account (made by scripts/create-staff-account.mjs), not a throwaway one.
  const acc = await db.from("staff_accounts").select("id, restaurant_id, role, is_active, session_version").eq("username", "olive-owner").single();
  if (acc.error) throw acc.error;
  expect(acc.data.restaurant_id).toBe(OLIVE);
  expect(acc.data.role).toBe("owner");
  expect(acc.data.is_active).toBe(true);
  // Read-only: the cookie carries the account's CURRENT session_version (password changes and resets raise it), never a fixed 1.
  return signSession({ staffId: acc.data.id, restaurantId: OLIVE, role: "owner", sessionVersion: acc.data.session_version ?? 1 });
}

async function call(body: unknown, cookieValue: string) {
  const res = await pricePreview(
    new Request("http://localhost/api/staff/price-preview", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `staff_session=${cookieValue}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

describe("olive-owner is limited to Olive", () => {
  it("a body restaurant_id of Napoli is refused with 403", async () => {
    const item = await db.from("menu_items").select("id").eq("restaurant_id", NAPOLI).limit(1).single();
    if (item.error) throw item.error;
    const r = await call({ restaurant_id: NAPOLI, order_type: "takeaway", items: [{ menu_item_id: item.data.id, quantity: 1 }] }, await oliveCookie());
    expect(r.status).toBe(403);
  });

  it("a Napoli menu item cannot be priced from Olive (400, unknown item)", async () => {
    const item = await db.from("menu_items").select("id").eq("restaurant_id", NAPOLI).limit(1).single();
    if (item.error) throw item.error;
    const r = await call({ order_type: "takeaway", items: [{ menu_item_id: item.data.id, quantity: 1 }] }, await oliveCookie());
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/not found for this restaurant/);
  });

  it("a Napoli order's print bill and KOT are 404 pages for olive-owner", async (ctx) => {
    const order = await db.from("orders").select("id").eq("restaurant_id", NAPOLI).limit(1).maybeSingle();
    if (order.error) throw order.error;
    if (!order.data) return ctx.skip(); // no Napoli order right now; tenancy.test.ts covers this with throwaway data
    cookieJar.value = await oliveCookie();
    try {
      const props = { params: Promise.resolve({ orderId: order.data.id }), searchParams: Promise.resolve({}) };
      for (const Page of [PrintBillPage, PrintKotPage]) {
        const err = await Page(props).then(() => null, (e: unknown) => e as { digest?: string });
        expect(err?.digest).toMatch(/404/);
      }
    } finally {
      cookieJar.value = undefined;
    }
  });
});

describe("Olive's menu in the database matches data/sites/olive-n-spice/menu.ts", () => {
  const expectedItems = menu.flatMap((g) => g.categories.flatMap((c) => c.items.map((item) => ({ category: c.name, item }))));
  const isConfirm = (notes?: string[]) => (notes ?? []).some((n) => n.startsWith("CONFIRM"));

  it("counts: categories, items, sizes", async () => {
    const cats = await db.from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", OLIVE);
    const items = await db.from("menu_items").select("id").eq("restaurant_id", OLIVE);
    const sizes = await db.from("item_sizes").select("id", { count: "exact", head: true }).in("menu_item_id", items.data!.map((i) => i.id));
    expect(cats.count).toBe(menu.reduce((n, g) => n + g.categories.length, 0));
    expect(items.data).toHaveLength(expectedItems.length);
    expect(sizes.count).toBe(expectedItems.filter((e) => e.item.prices.length > 1).reduce((n, e) => n + e.item.prices.length, 0));
  });

  it("every item's price, sizes and availability match (CONFIRM items are unavailable)", async () => {
    const cats = await db.from("menu_categories").select("id, name").eq("restaurant_id", OLIVE);
    const catName = new Map(cats.data!.map((c) => [c.id, c.name]));
    const res = await db
      .from("menu_items")
      .select("name, category_id, base_price, is_available, item_sizes ( name, price, is_default, sort_order )")
      .eq("restaurant_id", OLIVE);
    if (res.error) throw res.error;
    const key = (category: string, name: string) => `${category}|${name}`;
    const rows = new Map(res.data.map((r) => [key(catName.get(r.category_id!)!, r.name), r]));
    expect(rows.size).toBe(expectedItems.length);

    for (const { category, item } of expectedItems) {
      const row = rows.get(key(category, item.name));
      expect(row, `${category} / ${item.name} missing`).toBeTruthy();
      expect(Number(row!.base_price), `${item.name} base_price`).toBe(item.prices[0].amount);
      expect(row!.is_available, `${item.name} availability`).toBe(!isConfirm(item.notes));
      const sizes = [...row!.item_sizes].sort((a, b) => a.sort_order - b.sort_order);
      if (item.prices.length > 1) {
        expect(sizes.map((s) => Number(s.price)), `${item.name} size prices`).toEqual(item.prices.map((p) => p.amount));
        expect(sizes.some((s) => s.is_default), `${item.name} must have no default size`).toBe(false);
      } else {
        expect(sizes, `${item.name} should have no sizes`).toHaveLength(0);
      }
    }
  });
});

describe("Olive's restaurant row", () => {
  it("fixed facts never change: id, name, PKR, Karachi time, whole-rupee rounding, area-list delivery", async () => {
    const r = await db.from("restaurants").select("*").eq("id", OLIVE).single();
    if (r.error) throw r.error;
    expect(r.data).toMatchObject({
      id: OLIVE,
      name: "Olive 'n Spice",
      currency: "PKR",
      timezone: "Asia/Karachi",
      rounding_step: 1,
      delivery_mode: "area_list",
    });
  });

  it("owner-editable settings (Settings page) are valid, whatever value the owner chose", async () => {
    const r = await db
      .from("restaurants")
      .select("is_accepting_orders, delivery_fee, min_order_value, tax_rate_percent, service_charge_percent, max_discount_percent")
      .eq("id", OLIVE)
      .single();
    if (r.error) throw r.error;
    expect(typeof r.data.is_accepting_orders).toBe("boolean");
    for (const k of ["delivery_fee", "min_order_value", "tax_rate_percent", "service_charge_percent", "max_discount_percent"] as const) {
      expect(Number(r.data[k]), k).toBeGreaterThanOrEqual(0);
    }
    for (const k of ["tax_rate_percent", "service_charge_percent", "max_discount_percent"] as const) expect(Number(r.data[k]), k).toBeLessThanOrEqual(100);
  });

  it("a discount above the owner's max_discount_percent is rejected, one at the max is accepted", async () => {
    const r = await db.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", OLIVE).single();
    if (r.error) throw r.error;
    const settings = r.data as unknown as BillSettingsRow;
    const max = Number(settings.max_discount_percent);
    const atMax = computeBill(100000, "takeaway", settings, { type: "percent", value: max, reason: null });
    expect(atMax.ok).toBe(true);
    if (max < 100) {
      const over = computeBill(100000, "takeaway", settings, { type: "percent", value: max + 1, reason: null });
      expect(over.ok).toBe(false);
    }
  });

  it("is always open (24 hours, every day), checked with lib/opening-hours.ts", async () => {
    const r = await db.from("restaurants").select("opening_hours, timezone").eq("id", OLIVE).single();
    if (r.error) throw r.error;
    const hours = r.data.opening_hours as OpeningHours;
    // Every half hour for 8 days, from a Monday 00:00 Karachi time (= Sunday 19:00 UTC).
    const start = Date.parse("2031-03-02T19:00:00Z");
    for (let i = 0; i < 8 * 48 + 1; i++) {
      const at = new Date(start + i * 30 * 60_000);
      expect(checkOpen(hours, r.data.timezone, at), at.toISOString()).toEqual({ open: true });
    }
    // 23:59 and 00:00 edges
    for (const iso of ["2031-03-03T18:59:00Z", "2031-03-03T19:00:00Z", "2031-03-03T19:01:00Z"]) {
      expect(checkOpen(hours, r.data.timezone, new Date(iso))).toEqual({ open: true });
    }
  });
});

describe("Olive's sample bill is in whole rupees", () => {
  it("with Olive's real currency and rounding, charges at 0 (computeBill)", async () => {
    const r = await db.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", OLIVE).single();
    if (r.error) throw r.error;
    // The owner may set tax, service charge or delivery fee in Settings; this test is about the menu sum and rounding, so those are zeroed.
    const settings = { ...(r.data as unknown as BillSettingsRow), tax_rate_percent: 0, service_charge_percent: 0, delivery_fee: 0 };
    // 2 x Good Good Burger 699 + Masala Fries 349 + 2 x Fresh Lime 225 = 2197 rupees
    const subtotalPence = (2 * 699 + 349 + 2 * 225) * 100;
    const res = computeBill(subtotalPence, "takeaway", settings);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bill.totalPence).toBe(219700);
      expect(res.bill.totalPence % 100).toBe(0);
    }
  });

  it("with 5% tax and 7% service charge added, the total is still a whole rupee", async () => {
    const r = await db.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", OLIVE).single();
    if (r.error) throw r.error;
    const settings = { ...(r.data as unknown as BillSettingsRow), tax_rate_percent: 5, service_charge_percent: 7, service_charge_applies_to: "all" };
    for (const rupees of [1748, 2197, 899, 1399 + 349 + 199]) {
      const res = computeBill(rupees * 100, "takeaway", settings);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.bill.totalPence % 100, `${rupees}`).toBe(0);
        expect(Math.abs(res.bill.roundingPence)).toBeLessThanOrEqual(50);
      }
    }
  });
});

describe("Napoli is unchanged", () => {
  it("still GBP, 2.50 delivery, penny precision, 6 categories / 37 items", async () => {
    const r = await db.from("restaurants").select("currency, delivery_fee, rounding_step, tax_rate_percent").eq("id", NAPOLI).single();
    if (r.error) throw r.error;
    expect(r.data).toMatchObject({ currency: "GBP", delivery_fee: 2.5, rounding_step: 0.01, tax_rate_percent: 0 });
    const cats = await db.from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", NAPOLI);
    const items = await db.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", NAPOLI);
    expect(cats.count).toBe(6);
    expect(items.count).toBe(37);
  });
});
