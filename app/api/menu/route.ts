import { NextRequest, NextResponse } from "next/server";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import { timed } from "@/lib/timing";

// Public, read-only menu. Uses the anon client, so RLS applies.
// Exactly two queries, run in parallel:
//   1. categories -> items -> sizes (one nested PostgREST query)
//   2. every available option for the restaurant
// Options are then attached to items in memory.

type Size = { name: string; price: number; is_default: boolean; sort_order: number };
type Item = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  base_price: number;
  is_available: boolean;
  is_vegetarian: boolean;
  spice_level: number | null;
  sort_order: number;
  item_sizes: Size[];
};
type Category = { id: string; name: string; sort_order: number; menu_items: Item[] };
type Option = {
  id: string;
  menu_item_id: string | null;
  category_id: string | null;
  group_name: string;
  name: string;
  price_delta: number;
  max_select: number;
};

// z.guid() (any 8-4-4-4-12 hex id), not z.uuid(): the seeded demo ids like
// 11111111-1111-1111-1111-111111111111 aren't RFC-version UUIDs and z.uuid() rejects them.
const querySchema = z.object({ restaurant_id: z.guid() });

async function getMenu(restaurantId: string) {
  "use cache";
  // Cache Components replaces `export const revalidate = 60` with this.
  cacheLife({ revalidate: 60 });

  const [categoriesResult, optionsResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select(
        `id, name, sort_order,
         menu_items (
           id, category_id, name, description, base_price, is_available,
           is_vegetarian, spice_level, sort_order,
           item_sizes ( name, price, is_default, sort_order )
         )`,
      )
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order")
      .order("sort_order", { referencedTable: "menu_items" })
      .order("sort_order", { referencedTable: "menu_items.item_sizes" }),
    supabase
      .from("item_options")
      .select("id, menu_item_id, category_id, group_name, name, price_delta, max_select")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("group_name")
      .order("price_delta"),
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (optionsResult.error) throw optionsResult.error;

  const categories = categoriesResult.data as unknown as Category[];
  const options = optionsResult.data as Option[];

  // An option applies to an item if it targets that item, the item's
  // category, or neither (restaurant-wide).
  const optionsFor = (item: Item) =>
    options
      .filter(
        (o) =>
          o.menu_item_id === item.id ||
          (o.menu_item_id === null && o.category_id === item.category_id) ||
          (o.menu_item_id === null && o.category_id === null),
      )
      .map((o) => ({
        id: o.id,
        group: o.group_name,
        name: o.name,
        price_delta: Number(o.price_delta),
        max_select: o.max_select,
      }));

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.menu_items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      base_price: Number(item.base_price),
      available: item.is_available,
      vegetarian: item.is_vegetarian,
      spice_level: item.spice_level,
      sizes: item.item_sizes.map((s) => ({
        name: s.name,
        price: Number(s.price),
        is_default: s.is_default,
      })),
      options: optionsFor(item),
    })),
  }));
}

export const GET = timed("menu", async (request: NextRequest, timer) => {
  const parsed = querySchema.safeParse({
    restaurant_id: request.nextUrl.searchParams.get("restaurant_id"),
  });
  timer.lap("parse");
  if (!parsed.success) {
    return NextResponse.json(
      { error: "restaurant_id query parameter must be a valid uuid" },
      { status: 400 },
    );
  }

  try {
    const categories = await getMenu(parsed.data.restaurant_id);
    // Usually a cache hit (menu is cached for 60s), so often near 0ms.
    timer.lap("db");
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("GET /api/menu failed", error);
    return NextResponse.json({ error: "failed to load menu" }, { status: 500 });
  }
});
