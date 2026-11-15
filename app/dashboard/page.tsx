import { Suspense } from "react";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { supabaseAdmin } from "@/lib/supabase/server";
import { OrdersBoard, type BoardOrder } from "./orders-board";

// Live Orders: every order (phone, walk-in, table booking), newest first.
// One query pulls the orders with their items and the table number (if any).
async function Orders() {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      `id, order_number, status, source, total, created_at,
       order_items ( item_name, size_name, quantity ),
       table_sessions ( restaurant_tables ( table_number ) )`,
    )
    .eq("restaurant_id", DEMO_RESTAURANT_ID)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("dashboard: failed to load orders", error);
    return <p className="text-red-600">Could not load orders. Please refresh.</p>;
  }

  // Supabase types a nested to-one join loosely, so read it defensively.
  const orders: BoardOrder[] = (data ?? []).map((o) => {
    const session = Array.isArray(o.table_sessions) ? o.table_sessions[0] : o.table_sessions;
    const table = Array.isArray(session?.restaurant_tables) ? session.restaurant_tables[0] : session?.restaurant_tables;
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      source: o.source,
      table_number: table?.table_number ?? null,
      total: Number(o.total),
      created_at: o.created_at,
      items: (o.order_items ?? []).map((i) => ({ name: i.item_name, size: i.size_name, quantity: i.quantity })),
    };
  });

  return <OrdersBoard orders={orders} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-foreground/60">Loading orders...</p>}>
      <Orders />
    </Suspense>
  );
}
