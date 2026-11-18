import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pence, pounds } from "@/lib/order-pricing";

// Staff action: record a payment against an order (POS "Take payment").
//
// An order can be paid in several parts (split payment). Each call adds ONE
// payment. The database function record_payment_tx (migration 0013) does the
// work in a single locked step: it checks the order belongs to this
// restaurant, refuses a payment that would take the paid amount above the order
// total, saves the payment and updates payment_status / paid_amount. The order
// total itself is read from the database, never from the request.
//
// Double click protection: the screen sends an `idempotency_key` (a fresh random
// id for each payment it intends to make). Sending the same key again for the
// same order records nothing new and returns the current state with
// `duplicate: true`.

const bodySchema = z.object({
  restaurant_id: z.guid(),
  order_id: z.guid(),
  method: z.enum(["cash", "card", "online", "other"]),
  amount: z.number().finite().positive().max(100000),
  reference: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => v || null),
  idempotency_key: z.string().trim().min(8).max(100),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found for this restaurant", 404],
  order_cancelled: ["this order is cancelled", 409],
  already_paid: ["this order is already fully paid", 409],
  overpayment: ["payment is more than the amount still owed", 400],
};

export async function POST(request: Request) {
  const denied = requireDashboardSession(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;

  // Whole pence only: 5.005 is a mistake, not something to round.
  const amountPence = pence(body.amount);
  if (amountPence < 1 || Math.abs(amountPence - body.amount * 100) > 1e-6) {
    return fail("amount must be a valid money amount with at most 2 decimals", 400);
  }

  const { data, error } = await supabaseAdmin.rpc("record_payment_tx", {
    p_restaurant_id: body.restaurant_id,
    p_order_id: body.order_id,
    p_method: body.method,
    p_amount: pounds(amountPence),
    p_reference: body.reference,
    p_created_by: "dashboard",
    p_idempotency_key: body.idempotency_key,
  });
  if (error || !data) {
    console.error("record-payment: record_payment_tx failed", error);
    return fail("could not record the payment", 500);
  }

  const result = data as
    | { ok: true; duplicate: boolean; payment_status: string; paid_amount: number; total: number; balance: number }
    | { ok: false; error: string };
  if (!result.ok) {
    const [message, status] = RPC_ERRORS[result.error] ?? ["could not record the payment", 500];
    return fail(message, status);
  }

  return NextResponse.json(
    {
      success: true,
      duplicate: result.duplicate,
      payment_status: result.payment_status,
      paid_amount: Number(result.paid_amount),
      total: Number(result.total),
      balance: Number(result.balance),
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
