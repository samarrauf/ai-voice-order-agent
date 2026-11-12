import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { timed } from "@/lib/timing";

// Orders feed for the kitchen board (Phase 3): orders with their items, newest first.
// Uses the service role, so it returns customer names, phones and addresses.
// That's why it requires x-tool-secret — until Phase 3 adds a real staff login,
// call it only from server code, never directly from the browser.

const STATUSES = ["new", "accepted", "preparing", "ready", "completed", "cancelled"] as const;

const querySchema = z.object({
  status: z.enum(STATUSES).optional(),
  restaurant_id: z.guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const GET = timed("orders", async (request: NextRequest, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    status: sp.get("status") ?? undefined,
    restaurant_id: sp.get("restaurant_id") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: `invalid query; status must be one of ${STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const { status, restaurant_id, limit } = parsed.data;

  // One query: orders + nested order_items.
  let query = supabaseAdmin
    .from("orders")
    .select(
      `id, restaurant_id, order_number, status, fulfilment_type,
       customer_name, customer_phone, delivery_address, delivery_postcode,
       subtotal, delivery_fee, total, payment_method, notes, created_at, updated_at,
       order_items ( id, menu_item_id, item_name, size_name, options, quantity, unit_price, line_total, notes )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  if (restaurant_id) query = query.eq("restaurant_id", restaurant_id);

  const { data, error } = await query;
  timer.lap("db");
  if (error) {
    console.error("GET /api/orders failed", error);
    return NextResponse.json({ error: "failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
});
