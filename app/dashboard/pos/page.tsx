import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { requireStaffPage } from "@/lib/staff-page";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { deliveryModeOf } from "@/lib/delivery";
import { activeDeliveryAreas } from "@/lib/staff-delivery";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { PosTerminal } from "./pos-terminal";
import type { PosCategory, PosItem, PosOptionGroup, PosTable } from "./pos-types";

// POS terminal: one screen where staff build a walk-in (dine-in) or takeaway
// order. This server part loads the menu and the tables in five parallel
// queries and hands them to the interactive screen (./pos-terminal.tsx).

type SizeRow = { name: string; price: number | string; is_default: boolean; sort_order: number };
type ItemRow = {
  id: string;
  category_id: string | null;
  name: string;
  base_price: number | string;
  is_available: boolean;
  aliases: string[] | null;
  item_sizes: SizeRow[];
};
type CategoryRow = { id: string; name: string; menu_items: ItemRow[] };
type OptionRow = {
  menu_item_id: string | null;
  category_id: string | null;
  group_name: string;
  name: string;
  price_delta: number | string;
  max_select: number;
};

async function Pos() {
  // The restaurant always comes from the login session.
  const rid = (await requireStaffPage()).restaurantId;
  const [restaurantRes, categoriesRes, optionsRes, tablesRes, sessionsRes, areasRes] = await Promise.all([
    supabaseAdmin.from("restaurants").select("currency, delivery_mode").eq("id", rid).maybeSingle(),
    supabaseAdmin
      .from("menu_categories")
      .select(
        `id, name,
         menu_items ( id, category_id, name, base_price, is_available, aliases,
           item_sizes ( name, price, is_default, sort_order ) )`,
      )
      .eq("restaurant_id", rid)
      .eq("is_active", true)
      .is("archived_at", null)
      .is("menu_items.archived_at", null)
      .order("sort_order")
      .order("sort_order", { referencedTable: "menu_items" })
      .order("sort_order", { referencedTable: "menu_items.item_sizes" }),
    supabaseAdmin
      .from("item_options")
      .select("menu_item_id, category_id, group_name, name, price_delta, max_select")
      .eq("restaurant_id", rid)
      .eq("is_available", true)
      .order("group_name")
      .order("price_delta"),
    supabaseAdmin.from("restaurant_tables").select("id, table_number, seats").eq("restaurant_id", rid),
    supabaseAdmin.from("table_sessions").select("id, table_id, party_size").eq("restaurant_id", rid).is("cleared_at", null),
    activeDeliveryAreas(rid).order("label"),
  ]);

  const error =
    restaurantRes.error ?? categoriesRes.error ?? optionsRes.error ?? tablesRes.error ?? sessionsRes.error ?? areasRes.error;
  if (error) {
    console.error("pos: failed to load", error);
    return (
      <Card>
        <EmptyState
          className="min-h-64"
          icon={<CircleAlert size={20} />}
          title="Could not load the menu"
          message="Please refresh the page. If it keeps happening, check the internet connection."
        />
      </Card>
    );
  }

  const options = (optionsRes.data ?? []) as OptionRow[];

  // An option applies to an item if it targets that item, the item's category,
  // or neither (restaurant-wide): the same rule as lib/order-pricing.ts.
  const groupsFor = (item: ItemRow): PosOptionGroup[] => {
    const groups = new Map<string, PosOptionGroup>();
    for (const o of options) {
      const applies =
        o.menu_item_id === item.id ||
        (o.menu_item_id === null && o.category_id === item.category_id) ||
        (o.menu_item_id === null && o.category_id === null);
      if (!applies) continue;
      const g = groups.get(o.group_name) ?? { name: o.group_name, maxSelect: o.max_select, options: [] };
      g.maxSelect = Math.min(g.maxSelect, o.max_select);
      g.options.push({ name: o.name, priceDelta: Number(o.price_delta) });
      groups.set(o.group_name, g);
    }
    return [...groups.values()];
  };

  const categories: PosCategory[] = ((categoriesRes.data ?? []) as unknown as CategoryRow[])
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.menu_items.map((item): PosItem => {
        const sizes = item.item_sizes.map((s) => ({ name: s.name, price: Number(s.price), isDefault: s.is_default }));
        const shown = sizes.find((s) => s.isDefault) ?? sizes[0];
        return {
          id: item.id,
          name: item.name,
          price: shown ? shown.price : Number(item.base_price),
          available: item.is_available,
          sizes,
          optionGroups: groupsFor(item),
          search: [item.name, ...(item.aliases ?? [])].join(" ").toLowerCase(),
        };
      }),
    }))
    .filter((c) => c.items.length > 0);

  const sessionByTable = new Map((sessionsRes.data ?? []).map((s) => [s.table_id, s]));
  const tables: PosTable[] = (tablesRes.data ?? [])
    .map((t) => ({
      id: t.id,
      number: t.table_number,
      seats: t.seats,
      sessionId: sessionByTable.get(t.id)?.id ?? null,
      partySize: sessionByTable.get(t.id)?.party_size ?? null,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));

  return (
    <PosTerminal
      restaurantId={rid}
      currency={restaurantRes.data?.currency ?? DEFAULT_CURRENCY}
      deliveryMode={deliveryModeOf(restaurantRes.data?.delivery_mode)}
      deliveryAreas={(areasRes.data ?? []).map((a) => a.label)}
      categories={categories}
      tables={tables}
    />
  );
}

/** Shown while the menu loads: the same two-part shape as the real screen. */
function PosSkeleton() {
  return (
    <div role="status" aria-label="Loading the order screen" className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="mt-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="hidden h-96 rounded-2xl md:block" />
    </div>
  );
}

export default function PosPage() {
  return (
    <Suspense fallback={<PosSkeleton />}>
      <Pos />
    </Suspense>
  );
}
