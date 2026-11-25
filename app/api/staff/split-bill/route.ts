import { NextResponse } from "next/server";
import { z } from "zod";
import { computeSplit, encodeSplit, paidByGuestPence, SPLIT_ERRORS, splitOrderFromPrint, splitSpecSchema } from "@/lib/bill-split";
import { pounds } from "@/lib/order-pricing";
import { printSplitBillsHref } from "@/lib/print-links";
import { loadPrintData } from "@/lib/receipt-data";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";

// Staff action (B4c): work out a split bill. Read-only: nothing is saved.
//
// Without `split`: the order's lines and total (for the Split bill screen).
// With `split`: every guest's share, worked out HERE from the order as saved in
// the database (lib/bill-split.ts). The browser's own sums are never used; the
// payment route re-checks the same split before it takes a guest's money.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  split: splitSpecSchema.optional(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const auth = await requireCapability(request, "take_payment");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  const data = await loadPrintData(body.order_id, rid);
  if (!data) return fail("order not found for this restaurant", 404);
  const order = splitOrderFromPrint(data, data.restaurant.rounding_step);

  const summary = {
    order_number: data.order.order_number,
    status: data.order.status ?? null,
    payment_status: data.order.payment_status,
    currency: data.restaurant.currency ?? null,
    total: pounds(order.totalPence),
    paid_amount: Number(data.order.paid_amount ?? 0),
    rounding_step: pounds(order.stepPence),
    items: order.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, detail: l.detail, line_total: pounds(l.linePence) })),
  };
  if (!body.split) return NextResponse.json({ success: true, ...summary });

  const result = computeSplit(order, body.split);
  if (!result.ok) {
    const where = result.guest ? ` (guest ${result.guest})` : "";
    return NextResponse.json({ success: false, error: `${SPLIT_ERRORS[result.error]}${where}`, code: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    ...summary,
    print_href: printSplitBillsHref(body.order_id, encodeSplit(body.split)),
    guests: result.guests.map((g) => {
      const paid = paidByGuestPence(data.payments, g.label);
      return {
        guest: g.guest,
        label: g.label,
        subtotal: pounds(g.subtotalPence),
        discount: pounds(g.discountPence),
        delivery_fee: pounds(g.deliveryPence),
        service_charge: pounds(g.servicePence),
        tax: pounds(g.taxPence),
        rounding: pounds(g.roundingPence),
        total: pounds(g.totalPence),
        paid: pounds(paid),
        balance: pounds(Math.max(0, g.totalPence - paid)),
        items: g.pieces.map((p) => ({ id: p.lineId, shared_with: p.sharedWith, amount: pounds(p.pence) })),
      };
    }),
  });
}
