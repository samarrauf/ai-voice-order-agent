import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { BILL_SETTINGS_SELECT, computeBill, pence, pounds, type BillSettingsRow } from "@/lib/order-pricing";

// Staff action: merge two open dine-in orders into one. Capability merge_tables
// (owner and manager). The TARGET order keeps its number, its discount and receives
// all items of the SOURCE order; the source order becomes status 'merged' (it is left
// out of sales, profit and the boards) and its table is freed if nothing else is
// running on it. An order that already has a payment cannot be merged.
//
// THE MONEY RULE: the new subtotal is the sum of the items' saved line totals (the
// snapshot prices the guests were quoted), and the whole bill (discount, service
// charge, tax, rounding, total) is worked out again here by computeBill. merge_orders_tx
// (migration 0027) locks both orders, checks the items did not change since we read
// them, and writes the result atomically. The restaurant comes from the login session.

const bodySchema = z.object({
  restaurant_id: z.guid().optional(),
  source_order_id: z.guid(),
  target_order_id: z.guid(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found", 404],
  same_order: ["choose two different orders", 400],
  not_dine_in: ["only dine-in orders on a table can be merged", 409],
  order_closed: ["one of the orders is already closed, cancelled or merged", 409],
  already_paid: ["an order that already has a payment cannot be merged", 409],
  bad_bill: ["could not work out the new bill", 500],
};

type OrderRow = {
  id: string;
  discount_type: string;
  discount_value: number | string;
  discount_reason: string | null;
  order_items: { line_total: number | string; voided_at: string | null }[];
};

export async function POST(request: Request) {
  const auth = await requireCapability(request, "merge_tables");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const { source_order_id, target_order_id } = parsed.data;
  const mismatch = restaurantMismatch(parsed.data.restaurant_id, auth.staff);
  if (mismatch) return mismatch;
  if (source_order_id === target_order_id) return fail("choose two different orders", 400);

  // One try plus one retry: if an item was added between our read and the lock, read again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [ordersRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, discount_type, discount_value, discount_reason, order_items ( line_total, voided_at )")
        .eq("restaurant_id", rid)
        .in("id", [source_order_id, target_order_id]),
      supabaseAdmin.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", rid).maybeSingle(),
    ]);
    if (ordersRes.error || settingsRes.error || !settingsRes.data) {
      console.error("merge-orders: lookup failed", ordersRes.error ?? settingsRes.error);
      return fail("database lookup failed", 500);
    }
    const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
    const target = orders.find((o) => o.id === target_order_id);
    if (orders.length !== 2 || !target) return fail("order not found", 404);

    const subtotalPence = orders.reduce((n, o) => n + o.order_items.reduce((m, i) => (i.voided_at ? m : m + pence(i.line_total)), 0), 0);
    const billed = computeBill(subtotalPence, "dine_in", settingsRes.data as unknown as BillSettingsRow, {
      type: target.discount_type as "none" | "percent" | "fixed",
      value: Number(target.discount_value),
      reason: target.discount_reason,
    });
    if (!billed.ok) return fail(`cannot merge: ${billed.error}`, 409);
    const b = billed.bill;

    const { data, error } = await supabaseAdmin.rpc("merge_orders_tx", {
      p_restaurant_id: rid,
      p_staff_id: auth.staff.staffId,
      p_source_id: source_order_id,
      p_target_id: target_order_id,
      p_expected_subtotal: pounds(subtotalPence),
      p_bill: {
        subtotal: pounds(b.subtotalPence),
        discount_amount: pounds(b.discountPence),
        service_charge_amount: pounds(b.serviceChargePence),
        tax_amount: pounds(b.taxPence),
        rounding_amount: pounds(b.roundingPence),
        total: pounds(b.totalPence),
      },
    });
    if (error || !data) {
      console.error("merge-orders: merge_orders_tx failed", error);
      return fail("could not merge the orders", 500);
    }
    const result = data as {
      ok: boolean;
      error?: string;
      target_order_id?: string;
      target_order_number?: string;
      source_order_number?: string;
      items_moved?: number;
      total?: number;
      source_table_cleared?: boolean;
    };
    if (result.ok) {
      return NextResponse.json({
        success: true,
        target_order_id: result.target_order_id,
        target_order_number: result.target_order_number,
        source_order_number: result.source_order_number,
        items_moved: result.items_moved,
        total: result.total,
        source_table_cleared: !!result.source_table_cleared,
      });
    }
    if (result.error === "changed" && attempt === 0) continue;
    if (result.error === "changed") return fail("the orders changed while merging; try again", 409);
    const [message, status] = RPC_ERRORS[result.error ?? ""] ?? ["could not merge the orders", 500];
    return fail(message, status);
  }
  return fail("could not merge the orders", 500);
}
