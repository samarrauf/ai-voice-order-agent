import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, diffItem, isPhotoType, itemSchema, menuActionSchema, type StoredItem } from "@/lib/menu-admin";
import { can } from "@/lib/permissions";

// P7: menu editor validation and change log. Network-free.

const CAT = "22222222-2222-2222-2222-222222222222";
const valid = (over: Record<string, unknown> = {}) => ({ category_id: CAT, name: "Margherita", base_price: 8.99, ...over });
const parse = (v: unknown, currency = "GBP") => itemSchema(currency).safeParse(v);

describe("menu item validation", () => {
  it("accepts a normal item and fills defaults", () => {
    const r = parse(valid());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ description: "", sizes: [], options: [], aliases: [], is_available: true });
  });
  it("accepts a price of exactly 0", () => expect(parse(valid({ base_price: 0 })).success).toBe(true));
  it("rejects a negative price", () => expect(parse(valid({ base_price: -0.01 })).success).toBe(false));
  it("rejects more than two decimals", () => expect(parse(valid({ base_price: 8.999 })).success).toBe(false));
  it("rejects NaN, Infinity and strings", () => {
    expect(parse(valid({ base_price: NaN })).success).toBe(false);
    expect(parse(valid({ base_price: Infinity })).success).toBe(false);
    expect(parse(valid({ base_price: "8.99" })).success).toBe(false);
  });
  it("uses the currency limit from lib/money.ts", () => {
    expect(parse(valid({ base_price: 100_000 }), "GBP").success).toBe(true);
    expect(parse(valid({ base_price: 100_000.01 }), "GBP").success).toBe(false);
    expect(parse(valid({ base_price: 5_000_000 }), "PKR").success).toBe(true);
    expect(parse(valid({ base_price: 10_000_001 }), "PKR").success).toBe(false);
  });
  it("name is 1 to 80 characters (trimmed)", () => {
    expect(parse(valid({ name: "" })).success).toBe(false);
    expect(parse(valid({ name: "   " })).success).toBe(false);
    expect(parse(valid({ name: "a".repeat(80) })).success).toBe(true);
    expect(parse(valid({ name: "a".repeat(81) })).success).toBe(false);
  });
  it("description is at most 300 characters", () => {
    expect(parse(valid({ description: "d".repeat(300) })).success).toBe(true);
    expect(parse(valid({ description: "d".repeat(301) })).success).toBe(false);
  });
  it("sizes need exactly one default", () => {
    const s = (a: boolean, b: boolean) => [{ name: "Small", price: 5, is_default: a }, { name: "Large", price: 7, is_default: b }];
    expect(parse(valid({ sizes: s(true, false) })).success).toBe(true);
    expect(parse(valid({ sizes: s(false, false) })).success).toBe(false);
    expect(parse(valid({ sizes: s(true, true) })).success).toBe(false);
  });
  it("size prices follow the same price rules, and size names are unique", () => {
    expect(parse(valid({ sizes: [{ name: "S", price: -1, is_default: true }] })).success).toBe(false);
    expect(parse(valid({ sizes: [{ name: "S", price: 1, is_default: true }, { name: "s", price: 2, is_default: false }] })).success).toBe(false);
  });
  it("extras: price_delta not negative, max_select 1..20, no duplicates", () => {
    const o = (over: Record<string, unknown> = {}) => ({ group_name: "Toppings", name: "Cheese", price_delta: 1, max_select: 2, ...over });
    expect(parse(valid({ options: [o()] })).success).toBe(true);
    expect(parse(valid({ options: [o({ price_delta: -1 })] })).success).toBe(false);
    expect(parse(valid({ options: [o({ max_select: 0 })] })).success).toBe(false);
    expect(parse(valid({ options: [o(), o({ name: "CHEESE" })] })).success).toBe(false);
  });
  it("aliases are split on commas, trimmed, lower-cased and de-duplicated", () => {
    const r = parse(valid({ aliases: " Marg, margarita ,MARG," }));
    expect(r.success && r.data.aliases).toEqual(["marg", "margarita"]);
  });
  it("spice level is 0..3 or null; unknown fields are refused", () => {
    expect(parse(valid({ spice_level: 3 })).success).toBe(true);
    expect(parse(valid({ spice_level: 4 })).success).toBe(false);
    expect(parse(valid({ restaurant_id: CAT })).success).toBe(false);
  });
});

describe("menu action body", () => {
  const schema = menuActionSchema("GBP");
  it("accepts a known action, refuses unknown ones and bad ids", () => {
    expect(schema.safeParse({ action: "category_add", name: "Pizzas" }).success).toBe(true);
    expect(schema.safeParse({ action: "drop_everything" }).success).toBe(false);
    expect(schema.safeParse({ action: "item_archive", id: "nope" }).success).toBe(false);
  });
  it("accepts the restore actions, refuses a bad id", () => {
    const id = "22222222-2222-2222-2222-222222222222";
    expect(schema.safeParse({ action: "item_restore", id }).success).toBe(true);
    expect(schema.safeParse({ action: "category_restore", id }).success).toBe(true);
    expect(schema.safeParse({ action: "category_restore", id: "x" }).success).toBe(false);
  });
  it("category name is 1 to 80 characters", () => {
    expect(schema.safeParse({ action: "category_add", name: "" }).success).toBe(false);
    expect(schema.safeParse({ action: "category_add", name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("change log diff", () => {
  const old: StoredItem = {
    category_id: CAT, name: "Margherita", description: null, base_price: "8.99", is_available: true,
    is_vegetarian: true, spice_level: null, aliases: [], sort_order: 0, sizes: [], options: [],
  };
  const next = (over: Record<string, unknown> = {}) => {
    const r = parse(valid({ is_vegetarian: true, ...over }));
    if (!r.success) throw new Error("fixture invalid");
    return r.data;
  };
  it("records the price change with old and new value", () => {
    expect(diffItem(old, next({ base_price: 9.5 }))).toEqual([{ field: "base_price", old: "8.99", new: "9.50" }]);
  });
  it("records nothing when nothing changed", () => expect(diffItem(old, next())).toEqual([]));
  it("a new item logs every filled field", () => {
    const fields = diffItem(null, next()).map((c) => c.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "base_price", "category_id"]));
  });
  it("records size changes", () => {
    const d = diffItem(old, next({ sizes: [{ name: "S", price: 5, is_default: true }] }));
    expect(d).toEqual([{ field: "sizes", old: null, new: "S=5.00*" }]);
  });
});

describe("photo rules and permission", () => {
  it("only jpeg, png and webp; max 1.5 MB", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"]) expect(isPhotoType(t)).toBe(true);
    for (const t of ["image/gif", "image/svg+xml", "application/pdf", "text/html", "__proto__"]) expect(isPhotoType(t)).toBe(false);
    expect(PHOTO_MAX_BYTES).toBe(1_500_000);
  });
  it("menu_edit: owner and manager yes, staff no", () => {
    expect(can("owner", "menu_edit")).toBe(true);
    expect(can("manager", "menu_edit")).toBe(true);
    expect(can("staff", "menu_edit")).toBe(false);
  });
});
