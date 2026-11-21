import { Card, PageHeader } from "@/components/ui";
import { requireCapabilityPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { loadCostsById } from "@/lib/profit-data";
import { MenuEditor, type EditorCategory, type EditorItem, type EditorArchived } from "./menu-editor";

// Menu editor. Capability menu_edit (owner + manager, lib/permissions.ts); staff are sent
// back to /dashboard. The restaurant comes from the login. Archived categories and items
// are not listed (they are soft-deleted); hidden categories are, so they can be shown again.

type Row = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  menu_items: {
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    base_price: number | string;
    is_available: boolean;
    is_vegetarian: boolean;
    spice_level: number | null;
    aliases: string[] | null;
    sort_order: number;
    image_url: string | null;
    item_sizes: { id: string; name: string; price: number | string; is_default: boolean; sort_order: number }[];
  }[];
};

export default async function MenuPage() {
  const me = await requireCapabilityPage("menu_edit");
  const rid = me.restaurantId;

  // Cost (B2): only view_cost (owner) loads menu_costs; a manager's page never contains a cost.
  const showCost = can(me.role, "view_cost");
  const [cats, options, restaurant, archivedCats, archivedItems, costs] = await Promise.all([
    supabaseAdmin
      .from("menu_categories")
      .select(
        `id, name, sort_order, is_active,
         menu_items ( id, category_id, name, description, base_price, is_available, is_vegetarian,
           spice_level, aliases, sort_order, image_url, item_sizes ( id, name, price, is_default, sort_order ) )`,
      )
      .eq("restaurant_id", rid)
      .is("archived_at", null)
      .is("menu_items.archived_at", null)
      .order("sort_order")
      .order("sort_order", { referencedTable: "menu_items" })
      .order("created_at", { referencedTable: "menu_items" }),
    supabaseAdmin
      .from("item_options")
      .select("id, menu_item_id, group_name, name, price_delta, max_select")
      .eq("restaurant_id", rid)
      .not("menu_item_id", "is", null)
      .order("created_at"),
    supabaseAdmin.from("restaurants").select("currency").eq("id", rid).maybeSingle(),
    supabaseAdmin.from("menu_categories").select("id, name, archived_at").eq("restaurant_id", rid).not("archived_at", "is", null).order("archived_at", { ascending: false }),
    supabaseAdmin
      .from("menu_items")
      .select("id, name, archived_at, menu_categories ( name, archived_at )")
      .eq("restaurant_id", rid)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false }),
    showCost ? loadCostsById(rid).then((m) => ({ data: m, error: null }), (e) => ({ data: null, error: e })) : Promise.resolve({ data: null, error: null }),
  ]);

  if (cats.error || options.error || restaurant.error || archivedCats.error || archivedItems.error || costs.error) {
    console.error("menu page: could not load", cats.error?.message ?? options.error?.message ?? restaurant.error?.message);
    return (
      <div className="anim-rise">
        <PageHeader title="Menu" />
        <Card>
          <p className="text-sm text-ink-muted">Could not load the menu. Please refresh the page.</p>
        </Card>
      </div>
    );
  }

  const costMap = costs.data; // null unless owner
  const optionsByItem = new Map<string, EditorItem["options"]>();
  for (const o of options.data) {
    const list = optionsByItem.get(o.menu_item_id as string) ?? [];
    list.push({
      group_name: o.group_name,
      name: o.name,
      price_delta: Number(o.price_delta),
      max_select: o.max_select,
      ...(costMap ? { cost_price: costMap.get(o.id) ?? null } : {}),
    });
    optionsByItem.set(o.menu_item_id as string, list);
  }

  const categories: EditorCategory[] = (cats.data as unknown as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    visible: c.is_active,
    items: c.menu_items.map(
      (i): EditorItem => ({
        id: i.id,
        category_id: i.category_id,
        name: i.name,
        description: i.description ?? "",
        base_price: Number(i.base_price),
        is_available: i.is_available,
        is_vegetarian: i.is_vegetarian,
        spice_level: i.spice_level,
        aliases: i.aliases ?? [],
        sort_order: i.sort_order,
        image_url: i.image_url,
        sizes: [...i.item_sizes]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ name: s.name, price: Number(s.price), is_default: s.is_default, ...(costMap ? { cost_price: costMap.get(s.id) ?? null } : {}) })),
        options: optionsByItem.get(i.id) ?? [],
        ...(costMap ? { cost_price: costMap.get(i.id) ?? null } : {}),
      }),
    ),
  }));

  const archived: EditorArchived = {
    categories: archivedCats.data.map((c) => ({ id: c.id, name: c.name })),
    items: (archivedItems.data as unknown as { id: string; name: string; menu_categories: { name: string; archived_at: string | null } | null }[]).map((i) => ({
      id: i.id,
      name: i.name,
      category: i.menu_categories?.name ?? "",
      categoryArchived: !!i.menu_categories?.archived_at,
    })),
  };

  return (
    <div className="anim-rise">
      <PageHeader title="Menu" subtitle="Categories, dishes, sizes, extras and photos. Changes reach the POS and the voice agent straight away." />
      <MenuEditor categories={categories} currency={restaurant.data?.currency ?? "GBP"} archived={archived} showCost={showCost} />
    </div>
  );
}
