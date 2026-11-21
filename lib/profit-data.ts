import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { summarizeProfit, type CostMaps, type ProfitOrder, type ProfitSummary, sizeKey } from "@/lib/profit";

// Server loaders for cost and profit (B2). OWNER ONLY: every caller checks
// can(role, "view_cost" | "view_profit" | "manage_expenses") first; a role without it
// must never even run these queries. The restaurant always comes from the login session.

/** Every cost the restaurant has set (menu_costs, migration 0025), as lookup maps. One query. */
export async function loadCostMaps(restaurantId: string): Promise<CostMaps> {
  const { data, error } = await supabaseAdmin
    .from("menu_costs")
    .select("menu_item_id, item_size_id, item_option_id, cost_price, item_sizes ( menu_item_id, name )")
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  const maps: CostMaps = { item: new Map(), size: new Map(), option: new Map() };
  for (const r of (data ?? []) as unknown as Array<{
    menu_item_id: string | null;
    item_size_id: string | null;
    item_option_id: string | null;
    cost_price: number | string;
    item_sizes: { menu_item_id: string; name: string } | null;
  }>) {
    const cost = Number(r.cost_price);
    if (r.menu_item_id) maps.item.set(r.menu_item_id, cost);
    else if (r.item_option_id) maps.option.set(r.item_option_id, cost);
    else if (r.item_size_id && r.item_sizes) maps.size.set(sizeKey(r.item_sizes.menu_item_id, r.item_sizes.name), cost);
  }
  return maps;
}

/** Cost by id, for the menu editor: item id, size id, option id -> cost. */
export async function loadCostsById(restaurantId: string): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from("menu_costs")
    .select("menu_item_id, item_size_id, item_option_id, cost_price")
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  const byId = new Map<string, number>();
  for (const r of data ?? []) {
    const id = r.menu_item_id ?? r.item_size_id ?? r.item_option_id;
    if (id) byId.set(id, Number(r.cost_price));
  }
  return byId;
}

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 20;

/**
 * Sales, item cost, gross profit, expenses and net profit for a period.
 * Orders: created_at in [from, to). Expenses: expense_date in [fromDate, toDateExclusive)
 * (dates in the restaurant's own timezone, "YYYY-MM-DD").
 */
export async function loadProfitSummary(
  restaurantId: string,
  range: { from: Date; to: Date; fromDate: string; toDateExclusive: string },
): Promise<ProfitSummary> {
  const orders: ProfitOrder[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("status, subtotal, discount_amount, tax_amount, total, cost_total, cost_complete")
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled")
      .gte("created_at", range.from.toISOString())
      .lt("created_at", range.to.toISOString())
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    orders.push(...((data ?? []) as ProfitOrder[]));
    if (!data || data.length < PAGE) break;
  }

  const amounts: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .select("amount")
      .eq("restaurant_id", restaurantId)
      .is("voided_at", null)
      .gte("expense_date", range.fromDate)
      .lt("expense_date", range.toDateExclusive)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    amounts.push(...(data ?? []).map((e) => String(e.amount)));
    if (!data || data.length < PAGE) break;
  }

  return summarizeProfit(orders, amounts);
}
