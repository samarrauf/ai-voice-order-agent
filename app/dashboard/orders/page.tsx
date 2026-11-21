import { Suspense } from "react";
import { requireStaffPage } from "@/lib/staff-page";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CircleAlert } from "lucide-react";
import { Card, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { loadBoardOrders, type BoardOrder } from "@/lib/orders-board";
import { OrdersBoard } from "../orders-board";

// Orders (was "Live Orders"): every order (phone, walk-in, table booking), newest first.
// lib/orders-board.ts loads them (one query; cost/profit only for view_profit).
async function Orders() {
  // The restaurant always comes from the login session; the role decides if cost/profit is loaded (owner only).
  const { restaurantId, role } = await requireStaffPage();
  const currencyRes = await supabaseAdmin.from("restaurants").select("currency").eq("id", restaurantId).maybeSingle();
  const currency = currencyRes.data?.currency ?? DEFAULT_CURRENCY;
  let orders: BoardOrder[];
  try {
    orders = await loadBoardOrders(restaurantId, role);
  } catch (error) {
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

  return <OrdersBoard orders={orders} restaurantId={restaurantId} currency={currency} />;
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
