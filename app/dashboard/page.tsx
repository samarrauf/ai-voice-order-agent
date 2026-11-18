import { Suspense } from "react";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CircleAlert } from "lucide-react";
import { Card, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { OrdersBoard, type BoardOrder } from "./orders-board";

// Orders (was "Live Orders"): every order (phone, walk-in, table booking), newest first.
// One query pulls the orders with their items and the table number (if any).
async function Orders() {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      `id, order_number, status, source, total, payment_status, created_at,
       order_items ( item_name, size_name, quantity ),
       table_sessions ( restaurant_tables ( table_number ) )`,
    )
    .eq("restaurant_id", DEMO_RESTAURANT_ID)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("dashboard: failed to load orders", error);
    return (
      <Card>
        <EmptyState
          className="min-h-64"
          icon={<CircleAlert size={20} />}
          title="Could not load orders"
          message="Please refresh the page. If it keeps happening, check the internet connection."
        />
      </Card>
    );
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
      payment_status: o.payment_status,
      created_at: o.created_at,
      items: (o.order_items ?? []).map((i) => ({ name: i.item_name, size: i.size_name, quantity: i.quantity })),
    };
  });

  return <OrdersBoard orders={orders} />;
}

/** Shown while the orders load: the same shape as the real page, in shimmering grey. */
function OrdersSkeleton() {
  return (
    <div role="status" aria-label="Loading orders">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="mt-3 h-4 w-56" />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <Orders />
    </Suspense>
  );
}
