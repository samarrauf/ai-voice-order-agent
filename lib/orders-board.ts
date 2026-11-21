import "server-only";
import { can, type StaffRole } from "@/lib/permissions";
import { lineProfit, orderProfit, type LineCost } from "@/lib/profit";
import { supabaseAdmin } from "@/lib/supabase/server";

// Orders board data: every order (phone, walk-in, table booking), newest first, with
// its items and table number, in ONE query. The restaurant comes from the login session.
// THE cost gate: only a role with view_profit (owner) gets the cost columns selected at
// all; everyone else's query does not contain them and the result has no cost field.

export type BoardItem = { name: string; size: string | null; quantity: number; cost?: LineCost };

export type BoardOrder = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  table_number: string | null;
  total: number;
  payment_status: string;
  created_at: string;
  items: BoardItem[];
  /** Owner only, and not for cancelled orders. profit null = no cost snapshot (old order). */
  profit?: { profit: number | null; complete: boolean };
};

const BASE = `id, order_number, status, source, total, payment_status, created_at,
  table_sessions ( restaurant_tables ( table_number ) )`;

type Row = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  total: number | string;
  payment_status: string;
  created_at: string;
  subtotal?: number | string;
  discount_amount?: number | string;
  cost_total?: number | string | null;
  cost_complete?: boolean;
  order_items: { item_name: string; size_name: string | null; quantity: number; unit_price?: number | string; unit_cost?: number | string | null }[];
  table_sessions: unknown;
};

export async function loadBoardOrders(restaurantId: string, role: StaffRole, limit = 150): Promise<BoardOrder[]> {
  const owner = can(role, "view_profit");
  const columns = owner
    ? `${BASE}, subtotal, discount_amount, cost_total, cost_complete,
       order_items ( item_name, size_name, quantity, unit_price, unit_cost )`
    : `${BASE}, order_items ( item_name, size_name, quantity )`;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(columns)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  // Supabase types a nested to-one join loosely, so read it defensively.
  return ((data ?? []) as unknown as Row[]).map((o) => {
    const ts = o.table_sessions as { restaurant_tables?: unknown } | { restaurant_tables?: unknown }[] | null;
    const session = Array.isArray(ts) ? ts[0] : ts;
    const rt = session?.restaurant_tables as { table_number: string } | { table_number: string }[] | null | undefined;
    const table = Array.isArray(rt) ? rt[0] : rt;
    const showProfit = owner && o.status !== "cancelled";
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      source: o.source,
      table_number: table?.table_number ?? null,
      total: Number(o.total),
      payment_status: o.payment_status,
      created_at: o.created_at,
      items: (o.order_items ?? []).map((i) => ({
        name: i.item_name,
        size: i.size_name,
        quantity: i.quantity,
        ...(showProfit ? { cost: lineProfit(i.unit_price ?? 0, i.unit_cost ?? null, i.quantity) } : {}),
      })),
      ...(showProfit
        ? {
            profit: {
              profit: orderProfit({ subtotal: o.subtotal ?? 0, discount_amount: o.discount_amount ?? 0, cost_total: o.cost_total ?? null }),
              complete: !!o.cost_complete,
            },
          }
        : {}),
    };
  });
}
