import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { requireStaff, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { REFUND_METHODS, reasonSchema } from "@/lib/order-adjust";

// Staff action: cancel an order, with a reason (B4b).
//
// Who: any staff may cancel a 'new' order with no money taken. Anything else that is still
// open (accepted / preparing / ready, or any payment) needs cancel_order (owner/manager).
// Completed and merged orders are never cancelled (refund a completed order instead).
//
// Money: if the order has money on it (net paid > 0) the request must carry refund_method
// and the caller needs refund_payment too; the database function cancel_order_tx then
// cancels AND refunds everything in ONE transaction ("Cancel and refund"). If either part
// fails, neither happens. The amount refunded is read from the database, never the body.
//
// A cancelled order is final: update-order-status, record-payment and add-items refuse it.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  reason: reasonSchema,
  refund_method: z.enum(REFUND_METHODS).nullish(),
  idempotency_key: z.string().trim().min(8).max(100).nullish(),
});

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found", 404],
  order_closed: ["this order is completed or merged and cannot be cancelled (refund it instead)", 409],
  needs_manager: ["forbidden: only an owner or manager can cancel an order that is accepted, in the kitchen or paid", 403],
  key_used: ["this refund key was already used for a different payment; nothing was changed", 409],
};

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  const refundMethod = body.refund_method ?? null;
  if (refundMethod && !can(auth.staff.role, "refund_payment")) return fail("forbidden", 403);
  if (refundMethod && !body.idempotency_key) return fail("invalid body: idempotency_key is required with a refund", 400);

  const { data, error } = await supabaseAdmin.rpc("cancel_order_tx", {
    p_restaurant_id: rid,
    p_staff_id: auth.staff.staffId,
    p_order_id: body.order_id,
    p_reason: body.reason,
    p_can_cancel_any: can(auth.staff.role, "cancel_order"),
    p_refund_method: refundMethod,
    p_idempotency_key: refundMethod ? body.idempotency_key : null,
  });
  if (error || !data) {
    console.error("cancel-order: cancel_order_tx failed", error);
    return fail("could not cancel the order", 500);
  }

  const result = data as
    | { ok: true; duplicate: boolean; status: string; payment_status: string; refunded: number | string }
    | { ok: false; error: string; paid_amount?: number | string };
  if (!result.ok) {
    if (result.error === "refund_required") {
      return fail("money was taken on this order: choose how to refund it (Cancel and refund)", 409, {
        refund_required: true,
        paid_amount: Number(result.paid_amount ?? 0),
      });
    }
    const [message, status] = RPC_ERRORS[result.error] ?? ["could not cancel the order", 500];
    return fail(message, status);
  }

  return NextResponse.json({
    success: true,
    duplicate: result.duplicate,
    status: result.status,
    payment_status: result.payment_status,
    refunded: Number(result.refunded),
  });
}
