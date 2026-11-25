import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MAX_AMOUNT_ANY_CURRENCY } from "@/lib/money";
import { pence, pounds } from "@/lib/order-pricing";
import { REFUND_METHODS, reasonSchema } from "@/lib/order-adjust";

// Staff action: refund part or all of what was paid on an order (B4b). Owner/manager only
// (capability refund_payment).
//
// record_refund_tx (migration 0029) locks the order row, refuses more than the NET paid
// amount (payments minus earlier refunds), writes an order_payments row of kind 'refund'
// (method = how the money went back: a cash refund later comes out of the cash drawer)
// and an order_events row. Two refunds at the same moment run one after the other, so
// together they can never go above what was paid.
//
// Double click: the same idempotency_key on the same order records nothing new; it must
// be the SAME refund (amount and method), otherwise 409.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  method: z.enum(REFUND_METHODS),
  amount: z.number().finite().positive().max(MAX_AMOUNT_ANY_CURRENCY),
  reason: reasonSchema,
  idempotency_key: z.string().trim().min(8).max(100),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found", 404],
  order_merged: ["this order was merged into another order; refund that one", 409],
  nothing_to_refund: ["nothing was paid on this order, so there is nothing to refund", 409],
  not_fully_paid: ["this order is only part paid: take the rest first, or cancel the order to refund it", 409],
  overrefund: ["refund is more than the amount paid", 400],
  key_used: ["this refund key was already used for a payment; nothing was refunded", 409],
};

export async function POST(request: Request) {
  const auth = await requireCapability(request, "refund_payment");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  // Whole pence only: 5.005 is a mistake, not something to round.
  const amountPence = pence(body.amount);
  if (amountPence < 1 || Math.abs(amountPence - body.amount * 100) > 1e-6) {
    return fail("amount must be a valid money amount with at most 2 decimals", 400);
  }

  const { data, error } = await supabaseAdmin.rpc("record_refund_tx", {
    p_restaurant_id: rid,
    p_staff_id: auth.staff.staffId,
    p_order_id: body.order_id,
    p_method: body.method,
    p_amount: pounds(amountPence),
    p_reason: body.reason,
    p_idempotency_key: body.idempotency_key,
  });
  if (error || !data) {
    console.error("refund: record_refund_tx failed", error);
    return fail("could not record the refund", 500);
  }

  const result = data as
    | {
        ok: true;
        duplicate: boolean;
        payment_status: string;
        paid_amount: number | string;
        refunded_amount: number | string;
        refund_amount: number | string;
        refund_method: string;
      }
    | { ok: false; error: string };
  if (!result.ok) {
    const [message, status] = RPC_ERRORS[result.error] ?? ["could not record the refund", 500];
    return fail(message, status);
  }
  if (result.duplicate && (pence(result.refund_amount) !== amountPence || result.refund_method !== body.method)) {
    return fail("this refund key was already used for a different refund; nothing more was refunded", 409);
  }

  return NextResponse.json(
    {
      success: true,
      duplicate: result.duplicate,
      payment_status: result.payment_status,
      paid_amount: Number(result.paid_amount),
      refunded_amount: Number(result.refunded_amount),
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
