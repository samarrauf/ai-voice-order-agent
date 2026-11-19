import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: move an order along the kitchen board
// (new -> preparing -> ready -> completed). Only those four values are
// accepted; anything else is refused before the database is touched.

const BOARD_STATUSES = ["new", "preparing", "ready", "completed"] as const;

// A cancelled or completed order is final: its status can never change again.
const FINAL_STATUSES = ["cancelled", "completed"];

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  status: z.enum(BOARD_STATUSES),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: order_id (and restaurant_id, if sent) must be valid ids and status one of ${BOARD_STATUSES.join(", ")}`, 400);
  }
  const { order_id, status } = parsed.data;
  const mismatch = restaurantMismatch(parsed.data.restaurant_id, auth.staff);
  if (mismatch) return mismatch;
  const restaurant_id = rid;

  // The order must belong to the logged-in restaurant (same as the other staff routes).
  const { data: current, error: readError } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status")
    .eq("id", order_id)
    .eq("restaurant_id", restaurant_id)
    .maybeSingle();
  if (readError) {
    console.error("update-order-status: lookup failed", readError);
    return fail("could not update the order", 500);
  }
  if (!current) return fail("order not found", 404);

  if (FINAL_STATUSES.includes(current.status)) {
    // Repeating the same status (a double click) is harmless; anything else is refused.
    if (current.status === status) return NextResponse.json({ success: true, order: current });
    return fail(`this order is ${current.status} and its status cannot be changed`, 409);
  }

  // The update re-checks "not final" so a change that lands between the read and the write is not overwritten.
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", order_id)
    .eq("restaurant_id", restaurant_id)
    .not("status", "in", `(${FINAL_STATUSES.join(",")})`)
    .select("id, order_number, status")
    .maybeSingle();
  if (error) {
    console.error("update-order-status: update failed", error);
    return fail("could not update the order", 500);
  }
  if (!data) return fail("this order was just finished and its status cannot be changed", 409);
  return NextResponse.json({ success: true, order: data });
}
