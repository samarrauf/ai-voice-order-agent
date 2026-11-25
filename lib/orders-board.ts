import "server-only";
import { can, type StaffRole } from "@/lib/permissions";
import { lineProfit, orderProfit, type LineCost } from "@/lib/profit";
import { supabaseAdmin } from "@/lib/supabase/server";

// Orders board data: every order (phone, walk-in, table booking), newest first, with
// its items and table number, in ONE query. The restaurant comes from the login session.
// THE cost gate: only a role with view_profit (owner) gets the cost columns selected at
// all; everyone else's query does not contain them and the result has no cost field.

export type BoardItem = {
  id: string;
  name: string;
  size: string | null;
  quantity: number;
  /** B4b: a voided line stays on the order (struck through) with its reason. */
  voided: boolean;
  void_reason: string | null;
  cost?: LineCost;
};

export type BoardRefund = { amount: number; method: string; reason: string | null; created_at: string };

export type BoardOrder = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  table_number: string | null;
  total: number;
  payment_status: string;
  /** NET paid (payments minus refunds). */
  paid_amount: number;
  refunded_amount: number;
  cancel_reason: string | null;
  refunds: BoardRefund[];
  created_at: string;
  /** Items were added to this running order and the kitchen has not finished it yet. */
  has_new_items: boolean;
  items: BoardItem[];
  /** Owner only, and not for cancelled orders. profit null = no cost snapshot (old order). */
  profit?: { profit: number | null; complete: boolean };
};

const BASE = `id, order_number, status, source, total, payment_status, paid_amount, refunded_amount, cancel_reason,
  created_at, items_added_at, table_sessions ( restaurant_tables ( table_number ) ),
  order_payments ( kind, method, amount, refund_reason, created_at )`;

type Row = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  total: number | string;
  payment_status: string;
  paid_amount: number | string;
  refunded_amount: number | string | null;
  cancel_reason: string | null;
  order_payments: { kind: string; method: string; amount: number | string; refund_reason: string | null; created_at: string }[] | null;
  created_at: string;
  items_added_at: string | null;
  tax_amount?: number | string;
  subtotal?: number | string;
  discount_amount?: number | string;
  cost_total?: number | string | null;
  cost_complete?: boolean;
  order_items: {
    id: string;
    item_name: string;
    size_name: string | null;
    quantity: number;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string;
    unit_price?: number | string;
    unit_cost?: number | string | null;
  }[];
  table_sessions: unknown;
};

export async function loadBoardOrders(restaurantId: string, role: StaffRole, limit = 150): Promise<BoardOrder[]> {
  const owner = can(role, "view_profit");
  const columns = owner
    ? `${BASE}, subtotal, discount_amount, tax_amount, cost_total, cost_complete,
       order_items ( id, item_name, size_name, quantity, voided_at, void_reason, created_at, unit_price, unit_cost )`
    : `${BASE}, order_items ( id, item_name, size_name, quantity, voided_at, void_reason, created_at )`;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(columns)
    .eq("restaurant_id", restaurantId)
    .neq("status", "merged") // the source of a merge has no items or money left
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  // Supabase types a nested to-one join loosely, so read it defensively.
  return ((data ?? []) as unknown as Row[]).map((o) => {
    const ts = o.table_sessions as { restaurant_tables?: unknown } | { restaurant_tables?: unknown }[] | null;
    const session = Array.isArray(ts) ? ts[0] : ts;
    const rt = session?.restaurant_tables as { table_number: string } | { table_number: string }[] | null | undefined;
    const table = Array.isArray(rt) ? rt[0] : rt;
    const showProfit = owner && o.status !== "cancelled" && o.status !== "merged";
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      source: o.source,
      table_number: table?.table_number ?? null,
      total: Number(o.total),
      payment_status: o.payment_status,
      paid_amount: Number(o.paid_amount),
      refunded_amount: Number(o.refunded_amount ?? 0),
      cancel_reason: o.cancel_reason,
      refunds: (o.order_payments ?? [])
        .filter((p) => p.kind === "refund")
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => ({ amount: Number(p.amount), method: p.method, reason: p.refund_reason, created_at: p.created_at })),
      created_at: o.created_at,
      has_new_items: !!o.items_added_at && ["new", "accepted", "preparing"].includes(o.status),
      items: [...(o.order_items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => ({
        id: i.id,
        name: i.item_name,
        size: i.size_name,
        quantity: i.quantity,
        voided: !!i.voided_at,
        void_reason: i.void_reason,
        ...(showProfit && !i.voided_at ? { cost: lineProfit(i.unit_price ?? 0, i.unit_cost ?? null, i.quantity) } : {}),
      })),
      ...(showProfit
        ? {
            profit: {
              profit: orderProfit({
                subtotal: o.subtotal ?? 0,
                discount_amount: o.discount_amount ?? 0,
                cost_total: o.cost_total ?? null,
                total: o.total,
                tax_amount: o.tax_amount ?? 0,
                refunded_amount: o.refunded_amount ?? 0,
              }),
              complete: !!o.cost_complete,
            },
          }
        : {}),
    };
  });
}
