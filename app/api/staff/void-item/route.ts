import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { BILL_SETTINGS_SELECT, billForResponse, computeBill, pence, pounds, type BillSettingsRow } from "@/lib/order-pricing";
import { clampDiscount, kindOfOrder, reasonSchema } from "@/lib/order-adjust";

// Staff action: void ONE line of an order before any payment, with a reason (B4b).
// Owner/manager only (capability void_item).
//
// THE MONEY RULE: the new bill is worked out here by computeBill from the saved line
// totals of the lines that are left (never from the request). The order's discount is
// clamped first (clampDiscount): a fixed discount larger than the new subtotal or the
// restaurant cap shrinks to fit, a percent above the cap drops to the cap. The delivery
// fee is the one saved on the order. void_order_item_tx (migration 0029) locks the order,
// checks nothing changed since our read (else "changed": we read again), refuses a paid,
// closed or last-line order, then saves the void, the new bill and the cost.
//
// The voided line stays on the order for the record: the bill leaves it out, the kitchen
// ticket prints it as VOID.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  item_id: z.guid(),
  reason: reasonSchema,
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found", 404],
  item_not_found: ["item not found on this order", 404],
  order_closed: ["this order is cancelled, completed or merged: items cannot be voided", 409],
  already_paid: ["a payment is recorded on this order: items cannot be voided (refund instead)", 409],
  last_item: ["this is the last item on the order: cancel the order instead", 409],
  bad_bill: ["could not work out the new bill", 500],
};

type OrderRow = {
  id: string;
  table_session_id: string | null;
  fulfilment_type: string;
  delivery_fee: number | string;
  discount_type: "none" | "percent" | "fixed";
  discount_value: number | string;
  discount_reason: string | null;
  order_items: { id: string; line_total: number | string; voided_at: string | null }[];
};

const MAX_ATTEMPTS = 6;

export async function POST(request: Request) {
  const auth = await requireCapability(request, "void_item");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  const settingsRes = await supabaseAdmin.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", rid).maybeSingle();
  if (settingsRes.error) {
    console.error("void-item: settings lookup failed", settingsRes.error);
    return fail("database lookup failed", 500);
  }
  if (!settingsRes.data) return fail("restaurant not found", 404);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const orderRes = await supabaseAdmin
      .from("orders")
      .select(
        "id, table_session_id, fulfilment_type, delivery_fee, discount_type, discount_value, discount_reason, order_items ( id, line_total, voided_at )",
      )
      .eq("id", body.order_id)
      .eq("restaurant_id", rid)
      .maybeSingle();
    if (orderRes.error) {
      console.error("void-item: order lookup failed", orderRes.error);
      return fail("database lookup failed", 500);
    }
    const order = orderRes.data as unknown as OrderRow | null;
    if (!order) return fail("order not found", 404);
    const target = order.order_items.find((i) => i.id === body.item_id);
    if (!target) return fail(RPC_ERRORS.item_not_found[0], 404);

    const live = order.order_items.filter((i) => !i.voided_at);
    const oldPence = live.reduce((n, i) => n + pence(i.line_total), 0);
    // An already voided line (double click) goes straight to the function, which answers "duplicate".
    const newPence = target.voided_at ? oldPence : oldPence - pence(target.line_total);

    // The fee saved on the order, not today's setting (delivery areas may have set it).
    const settings: BillSettingsRow = { ...(settingsRes.data as unknown as BillSettingsRow), delivery_fee: order.delivery_fee };
    const { discount, clamped } = clampDiscount(newPence, settings, {
      type: order.discount_type,
      value: Number(order.discount_value),
      reason: order.discount_reason,
    });
    const billed = computeBill(newPence, kindOfOrder(order), settings, discount);
    if (!billed.ok) return fail(`cannot void this item: ${billed.error}`, 409);
    const b = billed.bill;

    const { data, error } = await supabaseAdmin.rpc("void_order_item_tx", {
      p_restaurant_id: rid,
      p_staff_id: auth.staff.staffId,
      p_order_id: body.order_id,
      p_item_id: body.item_id,
      p_reason: body.reason,
      p_expected_subtotal: pounds(oldPence),
      p_bill: {
        subtotal: pounds(b.subtotalPence),
        discount_amount: pounds(b.discountPence),
        service_charge_amount: pounds(b.serviceChargePence),
        tax_amount: pounds(b.taxPence),
        rounding_amount: pounds(b.roundingPence),
        total: pounds(b.totalPence),
      },
      p_discount: { type: discount.type, value: discount.value },
    });
    if (error || !data) {
      console.error("void-item: void_order_item_tx failed", error);
      return fail("could not void the item", 500);
    }
    const result = data as { ok: boolean; error?: string; duplicate?: boolean; total?: number | string; old_total?: number | string };
    if (result.ok) {
      if (result.duplicate) return NextResponse.json({ success: true, duplicate: true, total: Number(result.total) });
      return NextResponse.json({
        success: true,
        duplicate: false,
        old_total: Number(result.old_total),
        discount_clamped: clamped,
        ...billForResponse(b),
      });
    }
    if (result.error === "changed") {
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)));
      continue;
    }
    const [message, status] = RPC_ERRORS[result.error ?? ""] ?? ["could not void the item", 500];
    return fail(message, status);
  }
  return fail("the order kept changing; try again", 409);
}
