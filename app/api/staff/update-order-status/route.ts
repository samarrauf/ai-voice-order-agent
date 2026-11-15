import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: move an order along the kitchen board
// (new -> preparing -> ready -> completed). Only those four values are
// accepted; anything else is refused before the database is touched.

const BOARD_STATUSES = ["new", "preparing", "ready", "completed"] as const;

const bodySchema = z.object({
  order_id: z.guid(),
  status: z.enum(BOARD_STATUSES),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const denied = requireDashboardSession(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(`invalid body: order_id must be a valid id and status one of ${BOARD_STATUSES.join(", ")}`, 400);
  const { order_id, status } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", order_id)
    .select("id, order_number, status")
    .maybeSingle();
  if (error) {
    console.error("update-order-status: update failed", error);
    return fail("could not update the order", 500);
  }
  if (!data) return fail("order not found", 404);
  return NextResponse.json({ success: true, order: data });
}
