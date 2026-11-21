import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as menuRoute } from "@/app/api/staff/menu/route";
import { DELETE as photoDelete, POST as photoPost } from "@/app/api/staff/menu/photo/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as searchMenu } from "@/app/api/tools/search-menu/route";
import { RUN_MARKER, callTool, db, staffCookie } from "./helpers/helpers";

// P7: menu editor. Needs migration 0024. Only throwaway restaurants (names "vitest-run-...");
// Napoli and Olive are never touched. Their cascade delete removes every row; test photos
// are removed from the bucket explicitly.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let owner: string;
let manager: string;
let staff: string;
let ownerB: string;

async function menu(body: Record<string, unknown>, cookie: string | null = owner) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await menuRoute(new Request("http://localhost/api/staff/menu", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

async function upload(itemId: string, bytes: Uint8Array, type: string, cookie: string | null = owner) {
  const form = new FormData();
  form.set("item_id", itemId);
  form.set("file", new File([bytes as BlobPart], "p", { type }));
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const res = await photoPost(new Request("http://localhost/api/staff/menu/photo", { method: "POST", headers, body: form }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const item = (category_id: string, over: Record<string, unknown> = {}) => ({
  category_id,
  name: `${RUN_MARKER}-dish`,
  base_price: 8.5,
  ...over,
});

async function makeCategory(name: string, cookie = owner) {
  const r = await menu({ action: "category_add", name }, cookie);
  expect(r.status).toBe(200);
  return r.json.id as string;
}
async function makeItem(category: string, over: Record<string, unknown> = {}, cookie = owner) {
  const r = await menu({ action: "item_save", item: item(category, over) }, cookie);
  expect(r.status).toBe(200);
  return r.json.id as string;
}
const row = async (id: string) => (await db.from("menu_items").select("*").eq("id", id).single()).data as any;
const changes = async (entityId: string, field: string) =>
  ((await db.from("menu_changes").select("*").eq("entity_id", entityId).eq("field", field).order("changed_at")).data ?? []) as any[];

beforeAll(async () => {
  for (const label of ["a", "b"]) {
    const r = await db.from("restaurants").insert({ name: `${RUN_MARKER}-menu-${label}` }).select("id").single();
    if (r.error) throw r.error;
    if (label === "a") A = r.data.id;
    else B = r.data.id;
  }
  owner = await staffCookie(A, "owner");
  manager = await staffCookie(A, "manager");
  staff = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  for (const rid of [A, B]) {
    if (!rid) continue;
    const files = await db.storage.from("menu-photos").list(rid);
    if (files.data?.length) await db.storage.from("menu-photos").remove(files.data.map((f) => `${rid}/${f.name}`));
    await db.from("orders").delete().eq("restaurant_id", rid); // orders do not cascade from restaurants
    await db.from("restaurants").delete().eq("id", rid);
  }
});

describe("who may edit the menu", () => {
  it("no login = 401, staff = 403, manager and owner = 200", async () => {
    expect((await menu({ action: "category_add", name: "x" }, null)).status).toBe(401);
    expect((await menu({ action: "category_add", name: "Staff try" }, staff)).status).toBe(403);
    expect((await menu({ action: "category_add", name: "Manager cat" }, manager)).status).toBe(200);
    expect((await menu({ action: "category_add", name: "Owner cat" }, owner)).status).toBe(200);
  });
  it("staff also get 403 on item save, archive and photo", async () => {
    const cat = await makeCategory("Role cat");
    const id = await makeItem(cat, { name: "Role dish" });
    expect((await menu({ action: "item_save", item: item(cat, { name: "Nope" }) }, staff)).status).toBe(403);
    expect((await menu({ action: "item_archive", id }, staff)).status).toBe(403);
    expect((await menu({ action: "item_availability", id, available: false }, staff)).status).toBe(403);
    expect((await upload(id, PNG, "image/png", staff)).status).toBe(403);
    expect((await row(id)).archived_at).toBeNull();
  });
  it("a manager can save an item", async () => {
    const cat = await makeCategory("Manager item cat", manager);
    expect((await menu({ action: "item_save", item: item(cat, { name: "Manager dish" }) }, manager)).status).toBe(200);
  });
  it("a restaurant_id of another restaurant in the body = 403", async () => {
    expect((await menu({ action: "category_add", name: "Other", restaurant_id: B })).status).toBe(403);
    expect((await menu({ action: "category_add", name: "Same ok", restaurant_id: A })).status).toBe(200);
  });
});

describe("tenant isolation", () => {
  it("another restaurant's owner cannot rename, hide, move, archive or edit A's menu", async () => {
    const cat = await makeCategory("Iso cat");
    const id = await makeItem(cat, { name: "Iso dish" });
    expect((await menu({ action: "category_rename", id: cat, name: "Hacked" }, ownerB)).status).toBe(404);
    expect((await menu({ action: "category_visibility", id: cat, visible: false }, ownerB)).status).toBe(404);
    expect((await menu({ action: "category_move", id: cat, direction: "up" }, ownerB)).status).toBe(404);
    expect((await menu({ action: "category_archive", id: cat }, ownerB)).status).toBe(404);
    expect((await menu({ action: "item_archive", id }, ownerB)).status).toBe(404);
    expect((await menu({ action: "item_availability", id, available: false }, ownerB)).status).toBe(404);
    expect((await menu({ action: "item_save", id, item: item(cat, { name: "Hacked", base_price: 0.01 }) }, ownerB)).status).toBe(404);
    expect((await upload(id, PNG, "image/png", ownerB)).status).toBe(404);
    const after = await row(id);
    expect(after.name).toBe("Iso dish");
    expect(Number(after.base_price)).toBe(8.5);
    expect(after.archived_at).toBeNull();
  });
  it("B cannot put an item into A's category", async () => {
    const cat = await makeCategory("Iso cat 2");
    const r = await menu({ action: "item_save", item: item(cat, { name: "Sneaky" }) }, ownerB);
    expect(r.status).toBe(404);
    expect(((await db.from("menu_items").select("id").eq("restaurant_id", A).eq("name", "Sneaky")).data ?? []).length).toBe(0);
  });
});

describe("validation", () => {
  it("rejects bad prices, names, descriptions, size defaults", async () => {
    const cat = await makeCategory("Val cat");
    const bad = async (over: Record<string, unknown>) => (await menu({ action: "item_save", item: item(cat, over) })).status;
    expect(await bad({ base_price: -1 })).toBe(400);
    expect(await bad({ base_price: 1.234 })).toBe(400);
    expect(await bad({ base_price: 100_001 })).toBe(400);
    expect(await bad({ name: "" })).toBe(400);
    expect(await bad({ name: "n".repeat(81) })).toBe(400);
    expect(await bad({ description: "d".repeat(301) })).toBe(400);
    expect(await bad({ sizes: [{ name: "S", price: 1, is_default: false }] })).toBe(400);
    expect(await bad({ sizes: [{ name: "S", price: -1, is_default: true }] })).toBe(400);
    expect(await bad({ base_price: 0, name: "Free dish" })).toBe(200); // 0 is allowed
  });
  it("one category name once; one item name once per category", async () => {
    await makeCategory("Dup cat");
    expect((await menu({ action: "category_add", name: "dup CAT" })).status).toBe(409);
    const cat = await makeCategory("Dup item cat");
    await makeItem(cat, { name: "Same dish" });
    expect((await menu({ action: "item_save", item: item(cat, { name: "SAME dish" }) })).status).toBe(409);
    const other = await makeCategory("Dup item cat 2");
    expect((await menu({ action: "item_save", item: item(other, { name: "Same dish" }) })).status).toBe(200);
  });
});

describe("saving items, sizes, extras and the change log", () => {
  it("saves sizes and extras, then replaces them on edit", async () => {
    const cat = await makeCategory("Save cat");
    const id = await makeItem(cat, {
      name: "Pizza",
      aliases: "pie, pizzas",
      sizes: [
        { name: "10 inch", price: 7.95, is_default: true },
        { name: "12 inch", price: 9.45, is_default: false },
      ],
      options: [{ group_name: "Toppings", name: "Extra cheese", price_delta: 1.15, max_select: 2 }],
      is_vegetarian: true,
      spice_level: 1,
    });
    const saved = await row(id);
    expect(saved.aliases).toEqual(["pie", "pizzas"]);
    expect(saved.is_vegetarian).toBe(true);
    const sizes = (await db.from("item_sizes").select("*").eq("menu_item_id", id).order("sort_order")).data as any[];
    expect(sizes.map((s) => [s.name, Number(s.price), s.is_default])).toEqual([
      ["10 inch", 7.95, true],
      ["12 inch", 9.45, false],
    ]);
    const opts = (await db.from("item_options").select("*").eq("menu_item_id", id)).data as any[];
    expect(opts).toHaveLength(1);
    expect(opts[0].restaurant_id).toBe(A);

    const r = await menu({
      action: "item_save",
      id,
      item: item(cat, { name: "Pizza", sizes: [{ name: "10 inch", price: 8.45, is_default: true }], options: [] }),
    });
    expect(r.status).toBe(200);
    const after = (await db.from("item_sizes").select("*").eq("menu_item_id", id)).data as any[];
    expect(after.map((s) => [s.name, Number(s.price)])).toEqual([["10 inch", 8.45]]);
    expect(((await db.from("item_options").select("id").eq("menu_item_id", id)).data ?? []).length).toBe(0);
    expect((await changes(id, "sizes")).length).toBe(2);
  });
  it("logs a real base_price change with old and new value, who and when", async () => {
    const cat = await makeCategory("Log cat");
    const id = await makeItem(cat, { name: "Logged", base_price: 5 });
    expect((await changes(id, "base_price"))[0]).toMatchObject({ old_value: null, new_value: "5.00", entity: "item", restaurant_id: A });
    await menu({ action: "item_save", id, item: item(cat, { name: "Logged", base_price: 6.25 }) });
    const log = await changes(id, "base_price");
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ old_value: "5.00", new_value: "6.25" });
    expect(log[1].staff_id).toBeTruthy();
    expect(log[1].changed_at).toBeTruthy();
    // Saving the same values again logs nothing new.
    await menu({ action: "item_save", id, item: item(cat, { name: "Logged", base_price: 6.25 }) });
    expect(await changes(id, "base_price")).toHaveLength(2);
  });
  it("availability, rename and archive are logged", async () => {
    const cat = await makeCategory("Log cat 2");
    const id = await makeItem(cat, { name: "Toggle" });
    await menu({ action: "item_availability", id, available: false });
    expect((await changes(id, "is_available")).at(-1)).toMatchObject({ old_value: "true", new_value: "false" });
    await menu({ action: "category_rename", id: cat, name: "Log cat 2 renamed" });
    expect((await changes(cat, "name")).at(-1)).toMatchObject({ old_value: "Log cat 2", new_value: "Log cat 2 renamed" });
    await menu({ action: "item_archive", id });
    expect((await changes(id, "archived")).at(-1)).toMatchObject({ new_value: "true" });
  });
  it("categories move up/down, hide and show", async () => {
    const c1 = await makeCategory("Order 1");
    const c2 = await makeCategory("Order 2");
    const order = async () =>
      ((await db.from("menu_categories").select("id").eq("restaurant_id", A).in("id", [c1, c2]).order("sort_order")).data ?? []).map((c: any) => c.id);
    expect(await order()).toEqual([c1, c2]);
    await menu({ action: "category_move", id: c2, direction: "up" });
    expect(await order()).toEqual([c2, c1]);
    await menu({ action: "category_visibility", id: c1, visible: false });
    expect((await db.from("menu_categories").select("is_active").eq("id", c1).single()).data?.is_active).toBe(false);
    await menu({ action: "category_visibility", id: c1, visible: true });
    expect((await db.from("menu_categories").select("is_active").eq("id", c1).single()).data?.is_active).toBe(true);
  });
});

describe("photos", () => {
  it("rejects wrong type, a lie about the type, and big files; accepts png and replaces the old one", async () => {
    const cat = await makeCategory("Photo cat");
    const id = await makeItem(cat, { name: "Photo dish" });
    expect((await upload(id, PNG, "image/gif")).status).toBe(415);
    expect((await upload(id, new TextEncoder().encode("<svg/>"), "image/svg+xml")).status).toBe(415);
    expect((await upload(id, PNG, "image/jpeg")).status).toBe(415); // bytes are png, claimed jpeg
    const big = new Uint8Array(1_500_001);
    big.set(JPEG);
    expect((await upload(id, big, "image/jpeg")).status).toBe(413);
    expect((await row(id)).image_url).toBeNull();

    const first = await upload(id, PNG, "image/png");
    expect(first.status).toBe(200);
    expect(first.json.image_url).toMatch(new RegExp(`/menu-photos/${A}/[0-9a-f-]{36}\\.png$`));
    const firstPath = first.json.image_url.split("/menu-photos/")[1];
    const second = await upload(id, JPEG, "image/jpeg");
    expect(second.status).toBe(200);
    expect((await row(id)).image_url).toBe(second.json.image_url);
    const files = ((await db.storage.from("menu-photos").list(A)).data ?? []).map((f) => `${A}/${f.name}`);
    expect(files).not.toContain(firstPath); // the old photo is gone
    expect(files).toContain(second.json.image_url.split("/menu-photos/")[1]);
    expect((await changes(id, "image_url")).length).toBe(2);

    const del = await photoDelete(
      new Request("http://localhost/api/staff/menu/photo", {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: owner },
        body: JSON.stringify({ item_id: id }),
      }),
    );
    expect(del.status).toBe(200);
    expect((await row(id)).image_url).toBeNull();
    const left = ((await db.storage.from("menu-photos").list(A)).data ?? []).map((f) => `${A}/${f.name}`);
    expect(left).not.toContain(second.json.image_url.split("/menu-photos/")[1]);
  });
  it("the browser cannot write the bucket directly (no anon write)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const r = await anon.storage.from("menu-photos").upload(`${A}/${crypto.randomUUID()}.png`, PNG, { contentType: "image/png" });
    expect(r.error).toBeTruthy();
  });
});

describe("effect on the agent and the POS", () => {
  const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
    handler(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", cookie: owner }, body: JSON.stringify(body) }));

  it("an archived item is not found by the voice agent, a live one is", async () => {
    const cat = await makeCategory("Agent cat");
    const live = await makeItem(cat, { name: "Zzquux Delight" });
    const gone = await makeItem(cat, { name: "Qqxylo Feast" });
    await menu({ action: "item_archive", id: gone });
    const a = await callTool(searchMenu, { restaurant_id: A, query: "Qqxylo Feast" });
    expect(a.json.matches ?? []).toEqual([]);
    const b = await callTool(searchMenu, { restaurant_id: A, query: "Zzquux Delight" });
    expect(b.json.matches[0].id).toBe(live);
  });
  it("items of an archived category disappear from the agent too", async () => {
    const cat = await makeCategory("Agent cat 2");
    await makeItem(cat, { name: "Vvbrax Special" });
    expect((await callTool(searchMenu, { restaurant_id: A, query: "Vvbrax Special" })).json.matches[0]).toBeTruthy();
    const r = await menu({ action: "category_archive", id: cat });
    expect(r.json.archived_items).toBe(1);
    expect((await callTool(searchMenu, { restaurant_id: A, query: "Vvbrax Special" })).json.matches ?? []).toEqual([]);
  });
  it("the POS refuses an archived item (preview and order)", async () => {
    const cat = await makeCategory("Pos cat");
    const id = await makeItem(cat, { name: "Posdish" });
    const body = { order_type: "takeaway", items: [{ menu_item_id: id, quantity: 1, options: [], notes: null }] };
    expect((await post(pricePreview, body)).status).toBe(200);
    await menu({ action: "item_archive", id });
    for (const handler of [pricePreview, manualOrder]) {
      const res = await post(handler, body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
  it("a price change applies to new orders and never changes an old order", async () => {
    const cat = await makeCategory("Price cat");
    const id = await makeItem(cat, { name: "Pricey", base_price: 10 });
    const order = async () => {
      const res = await post(manualOrder, { order_type: "takeaway", items: [{ menu_item_id: id, quantity: 2, options: [], notes: null }] });
      expect(res.status).toBe(201);
      return ((await res.json()) as any).order_id as string;
    };
    const first = await order();
    const before = (await db.from("orders").select("*").eq("id", first).single()).data as any;
    const linesBefore = (await db.from("order_items").select("*").eq("order_id", first)).data as any[];
    expect(linesBefore[0]).toMatchObject({ item_name: "Pricey" });
    expect(Number(linesBefore[0].unit_price)).toBe(10);

    expect((await menu({ action: "item_save", id, item: item(cat, { name: "Pricey renamed", base_price: 12.5 }) })).status).toBe(200);

    const after = (await db.from("orders").select("*").eq("id", first).single()).data as any;
    const linesAfter = (await db.from("order_items").select("*").eq("order_id", first)).data as any[];
    expect(Number(after.total)).toBe(Number(before.total));
    expect(Number(after.subtotal)).toBe(Number(before.subtotal));
    expect(linesAfter[0].item_name).toBe("Pricey");
    expect(Number(linesAfter[0].unit_price)).toBe(10);

    const second = await order();
    const newLines = (await db.from("order_items").select("*").eq("order_id", second)).data as any[];
    expect(Number(newLines[0].unit_price)).toBe(12.5);
    expect(newLines[0].item_name).toBe("Pricey renamed");

    // Archiving the dish does not touch either order.
    await menu({ action: "item_archive", id });
    expect(Number(((await db.from("orders").select("total").eq("id", first).single()).data as any).total)).toBe(Number(before.total));
  });
});

describe("restore", () => {
  const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
    handler(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", cookie: owner }, body: JSON.stringify(body) }));

  it("a restored item is back in the POS and the voice agent", async () => {
    const cat = await makeCategory("Restore cat");
    const id = await makeItem(cat, { name: "Wwzorp Pie" });
    await menu({ action: "item_archive", id });
    const body = { order_type: "takeaway", items: [{ menu_item_id: id, quantity: 1, options: [], notes: null }] };
    expect((await post(pricePreview, body)).status).toBeGreaterThanOrEqual(400);
    expect((await callTool(searchMenu, { restaurant_id: A, query: "Wwzorp Pie" })).json.matches ?? []).toEqual([]);

    expect((await menu({ action: "item_restore", id })).status).toBe(200);
    expect((await row(id)).archived_at).toBeNull();
    expect((await post(pricePreview, body)).status).toBe(200);
    expect((await callTool(searchMenu, { restaurant_id: A, query: "Wwzorp Pie" })).json.matches[0].id).toBe(id);
    const log = await changes(id, "archived");
    expect(log.at(-1)).toMatchObject({ old_value: "true", new_value: "false" });
  });

  it("category restore brings back only the items archived with it", async () => {
    const cat = await makeCategory("Restore part cat");
    const early = await makeItem(cat, { name: "Early archived" });
    const together = await makeItem(cat, { name: "Archived together" });
    await menu({ action: "item_archive", id: early });
    await new Promise((r) => setTimeout(r, 20));
    expect((await menu({ action: "category_archive", id: cat })).json.archived_items).toBe(1);

    // An item cannot be restored while its category is archived.
    expect((await menu({ action: "item_restore", id: early })).status).toBe(409);

    const r = await menu({ action: "category_restore", id: cat });
    expect(r.status).toBe(200);
    expect(r.json.restored_items).toBe(1);
    expect((await db.from("menu_categories").select("archived_at").eq("id", cat).single()).data?.archived_at).toBeNull();
    expect((await row(together)).archived_at).toBeNull();
    expect((await row(early)).archived_at).not.toBeNull(); // was archived earlier: stays archived
    expect((await changes(cat, "archived")).at(-1)).toMatchObject({ old_value: "true", new_value: "false" });
    expect((await changes(together, "archived")).at(-1)).toMatchObject({ new_value: "false" });

    // Now the early one can be restored on its own.
    expect((await menu({ action: "item_restore", id: early })).status).toBe(200);
  });

  it("refuses a restore that would make a duplicate name", async () => {
    const cat = await makeCategory("Restore dup cat");
    const id = await makeItem(cat, { name: "Twin" });
    await menu({ action: "item_archive", id });
    await makeItem(cat, { name: "Twin" });
    expect((await menu({ action: "item_restore", id })).status).toBe(409);
    await menu({ action: "category_archive", id: cat });
    await makeCategory("Restore dup cat");
    expect((await menu({ action: "category_restore", id: cat })).status).toBe(409);
  });

  it("another restaurant cannot restore A's item or category", async () => {
    const cat = await makeCategory("Restore iso cat");
    const id = await makeItem(cat, { name: "Restore iso dish" });
    await menu({ action: "item_archive", id });
    expect((await menu({ action: "item_restore", id }, ownerB)).status).toBe(404);
    expect((await row(id)).archived_at).not.toBeNull();
    await menu({ action: "category_archive", id: cat });
    expect((await menu({ action: "category_restore", id: cat }, ownerB)).status).toBe(404);
    expect((await db.from("menu_categories").select("archived_at").eq("id", cat).single()).data?.archived_at).not.toBeNull();
  });

  it("staff get 403 on restore, manager can", async () => {
    const cat = await makeCategory("Restore role cat");
    const id = await makeItem(cat, { name: "Restore role dish" });
    await menu({ action: "item_archive", id });
    expect((await menu({ action: "item_restore", id }, staff)).status).toBe(403);
    expect((await menu({ action: "item_restore", id }, null)).status).toBe(401);
    expect((await row(id)).archived_at).not.toBeNull();
    expect((await menu({ action: "item_restore", id }, manager)).status).toBe(200);
    await menu({ action: "category_archive", id: cat });
    expect((await menu({ action: "category_restore", id: cat }, staff)).status).toBe(403);
    expect((await menu({ action: "category_restore", id: cat }, manager)).status).toBe(200);
  });
});
