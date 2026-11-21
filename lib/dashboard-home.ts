import "server-only";
import { buildSalesReport, OPEN_STATUSES, orderTypeOf, periodFor, type OrderType, type RangeKey, type SalesReport, type StatsItem, type StatsOrder } from "@/lib/dashboard-stats";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { can, type StaffRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rangeForHome } from "@/lib/expenses";
import type { ProfitSummary } from "@/lib/profit";
import { loadProfitSummary } from "@/lib/profit-data";

// Loads everything the Home dashboard shows. THE role gate lives here: a role
// without `view_reports` (staff) never even queries sales columns (total, tax,
// paid, order lines), and the object it gets back has no `reports` part and no
// money field anywhere. A role without `view_profit` (everyone but the owner) never
// queries cost/expenses and gets no `profit` part. The restaurant always comes from the login session.

export type LiveOrder = {
  id: string;
  orderNumber: string;
  status: string;
  type: OrderType;
  createdAt: string;
  /** Only for roles that may view reports. */
  total?: number;
};

export type HomeOps = {
  running: number;
  waiting: number;
  /** null = this restaurant has no tables set up. */
  tables: { seated: number; count: number } | null;
  live: LiveOrder[];
};

export type HomeData = {
  restaurantName: string;
  timeZone: string;
  currency: string;
  ops: HomeOps;
  /** null for roles without view_reports. */
  reports: SalesReport | null;
  /** Owner only (view_profit): net profit for the chosen range. Absent for everyone else. */
  profit?: ProfitSummary;
};

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 20; // 20,000 orders in a period is far beyond a takeaway; stops a runaway loop

async function fetchOrders(restaurantId: string, from: Date, to: Date): Promise<StatsOrder[]> {
  const rows: StatsOrder[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("status, fulfilment_type, source, table_session_id, total, tax_amount, paid_amount, created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []).map((o) => ({ ...o, total: Number(o.total), tax_amount: Number(o.tax_amount), paid_amount: Number(o.paid_amount) })));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function fetchItems(restaurantId: string, from: Date, to: Date): Promise<StatsItem[]> {
  const rows: StatsItem[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("item_name, quantity, orders!inner(restaurant_id, status, created_at)")
      .eq("orders.restaurant_id", restaurantId)
      .neq("orders.status", "cancelled")
      .gte("orders.created_at", from.toISOString())
      .lt("orders.created_at", to.toISOString())
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []).map((r) => ({ item_name: r.item_name, quantity: r.quantity })));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function loadOps(restaurantId: string, withTotals: boolean): Promise<HomeOps> {
  // Staff never ask for `total`: their query simply does not contain it.
  const liveColumns = "id, order_number, status, source, fulfilment_type, table_session_id, created_at" + (withTotals ? ", total" : "");
  const [running, waiting, tablesTotal, tablesSeated, live] = await Promise.all([
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", [...OPEN_STATUSES]),
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "new"),
    supabaseAdmin.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabaseAdmin.from("table_sessions").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).is("cleared_at", null),
    supabaseAdmin.from("orders").select(liveColumns).eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(5),
  ]);
  for (const r of [running, waiting, tablesTotal, tablesSeated, live]) if (r.error) throw r.error;
  const rows = (live.data ?? []) as unknown as Array<Record<string, string | number | null>>;
  return {
    running: running.count ?? 0,
    waiting: waiting.count ?? 0,
    tables: (tablesTotal.count ?? 0) > 0 ? { seated: tablesSeated.count ?? 0, count: tablesTotal.count ?? 0 } : null,
    live: rows.map((o) => ({
      id: String(o.id),
      orderNumber: String(o.order_number),
      status: String(o.status),
      type: orderTypeOf({ fulfilment_type: String(o.fulfilment_type), source: String(o.source), table_session_id: (o.table_session_id as string | null) ?? null }),
      createdAt: String(o.created_at),
      ...(withTotals ? { total: Number(o.total) } : {}),
    })),
  };
}

/** Home data for one restaurant and role. `now` is injectable for tests. */
export async function loadHome(input: { restaurantId: string; role: StaffRole; range: RangeKey; now?: Date }): Promise<HomeData> {
  const { restaurantId, role, range } = input;
  const now = input.now ?? new Date();
  const wantsReports = can(role, "view_reports");
  const restaurant = await supabaseAdmin.from("restaurants").select("name, timezone, currency").eq("id", restaurantId).maybeSingle();
  if (restaurant.error) throw restaurant.error;
  const timeZone = restaurant.data?.timezone || "Europe/London";
  const currency = restaurant.data?.currency || DEFAULT_CURRENCY;

  const ops = loadOps(restaurantId, wantsReports);
  const wantsProfit = can(role, "view_profit");
  const profit = wantsProfit ? loadProfitSummary(restaurantId, rangeForHome(range, now, timeZone)) : null;
  let reports: SalesReport | null = null;
  if (wantsReports) {
    const period = periodFor(range, now, timeZone);
    const [orders, items] = await Promise.all([fetchOrders(restaurantId, period.prevStart, period.end), fetchItems(restaurantId, period.start, period.end)]);
    reports = buildSalesReport({ orders, items, range, now, timeZone });
  }
  return {
    restaurantName: restaurant.data?.name ?? "",
    timeZone,
    currency,
    ops: await ops,
    reports,
    ...(profit ? { profit: await profit } : {}),
  };
}
