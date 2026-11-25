import "server-only";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { can, type StaffRole } from "@/lib/permissions";
import {
  buildReport,
  businessDayMinutes,
  reportPeriod,
  type Report,
  type ReportItem,
  type ReportOrder,
  type ReportPayment,
  type ReportRange,
} from "@/lib/reports";
import { addDays } from "@/lib/expenses";
import { supabaseAdmin } from "@/lib/supabase/server";

// Loads the Reports page (P4). Only RAW rows come from the database; every figure is
// worked out by lib/reports.ts. THE role gates live here:
//   - view_reports (owner, manager): callers check it first (page + API route).
//   - view_profit (owner only): without it, cost columns (orders.cost_total/cost_complete,
//     order_items.line_cost) and expenses are never even queried, and the report has no
//     `profit` part and no per-item profit.
// The restaurant always comes from the login session.

export type ReportData = {
  restaurantName: string;
  timeZone: string;
  currency: string;
  report: Report;
};

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 50; // 50,000 rows is far beyond a takeaway's year; stops a runaway loop

type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

async function fetchAll<T>(query: PageQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await query(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const ORDER_COLUMNS =
  "id, order_number, status, payment_status, fulfilment_type, source, table_session_id, customer_name, subtotal, discount_amount, tax_amount, total, paid_amount, refunded_amount, created_at";

export async function loadReport(input: {
  restaurantId: string;
  role: StaffRole;
  range: ReportRange;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): Promise<ReportData> {
  const { restaurantId, role } = input;
  const now = input.now ?? new Date();
  const withProfit = can(role, "view_profit");

  const restaurant = await supabaseAdmin
    .from("restaurants")
    .select("name, timezone, currency, business_day_start")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restaurant.error) throw restaurant.error;
  const timeZone = restaurant.data?.timezone || "Europe/London";
  const currency = restaurant.data?.currency || DEFAULT_CURRENCY;
  const dayStartMinutes = businessDayMinutes(restaurant.data?.business_day_start);
  const period = reportPeriod({ range: input.range, from: input.from, to: input.to }, now, timeZone, dayStartMinutes);

  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const orders = fetchAll<ReportOrder>((a, b) =>
    supabaseAdmin
      .from("orders")
      .select(withProfit ? `${ORDER_COLUMNS}, cost_total, cost_complete` : ORDER_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", period.prevStart.toISOString())
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(a, b) as unknown as PromiseLike<{ data: ReportOrder[] | null; error: unknown }>,
  );

  const items = fetchAll<ReportItem & { orders?: unknown }>((a, b) =>
    supabaseAdmin
      .from("order_items")
      .select(`order_id, item_name, quantity, line_total${withProfit ? ", line_cost" : ""}, orders!inner(restaurant_id, status, created_at)`)
      .eq("orders.restaurant_id", restaurantId)
      .is("voided_at", null) // a voided line (B4b) was not sold
      .not("orders.status", "in", "(cancelled,merged)")
      .gte("orders.created_at", startIso)
      .lt("orders.created_at", endIso)
      .order("id", { ascending: true })
      .range(a, b) as unknown as PromiseLike<{ data: (ReportItem & { orders?: unknown })[] | null; error: unknown }>,
  );

  // Money taken (and given back) during the period, by when it happened.
  const payments = fetchAll<ReportPayment>((a, b) =>
    supabaseAdmin
      .from("order_payments")
      .select("kind, method, amount")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("id", { ascending: true })
      .range(a, b) as unknown as PromiseLike<{ data: ReportPayment[] | null; error: unknown }>,
  );

  const expenseAmounts = (fromDate: string, toDate: string) =>
    fetchAll<{ amount: number | string }>((a, b) =>
      supabaseAdmin
        .from("expenses")
        .select("amount")
        .eq("restaurant_id", restaurantId)
        .is("voided_at", null)
        .gte("expense_date", fromDate)
        .lt("expense_date", addDays(toDate, 1))
        .order("id", { ascending: true })
        .range(a, b) as unknown as PromiseLike<{ data: { amount: number | string }[] | null; error: unknown }>,
    ).then((rows) => rows.map((r) => r.amount));

  const expenses = withProfit
    ? Promise.all([expenseAmounts(period.fromDate, period.toDate), expenseAmounts(period.prevFromDate, period.prevToDate)])
    : null;

  const [orderRows, itemRows, paymentRows] = await Promise.all([orders, items, payments]);
  const exp = expenses ? await expenses : null;

  const report = buildReport({
    period,
    orders: orderRows,
    // Drop the joined order (only used for filtering) so nothing extra travels on.
    items: itemRows.map((r) => ({ order_id: r.order_id, item_name: r.item_name, quantity: r.quantity, line_total: r.line_total, ...(withProfit ? { line_cost: r.line_cost ?? null } : {}) })),
    payments: paymentRows,
    timeZone,
    dayStartMinutes,
    withProfit,
    ...(exp ? { expenses: { current: exp[0], previous: exp[1] } } : {}),
  });

  return { restaurantName: restaurant.data?.name ?? "", timeZone, currency, report };
}
