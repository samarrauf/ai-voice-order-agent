import { z } from "zod";
import { pence, type BillSettingsRow, type DiscountInput, type OrderKind } from "@/lib/order-pricing";

// B4b: cancel an order, void an item, refund a payment. Pure rules shared by the API
// routes, the dashboard screens and the tests (no server imports).
//
// MONEY WORDS
//   paid_amount     = NET money kept: payments minus refunds (migration 0029).
//   refunded_amount = sum of the refunds.
//   owed            = what the customer still has to pay. After any refund the bill is
//                     settled (no new payment is taken), so owed = total - net - refunded.

/** Preset reasons. The screen also allows typing a different one. */
export const CANCEL_REASONS = ["Customer changed mind", "Duplicate order", "Item not available", "Wrong order", "Test order"] as const;
export const VOID_REASONS = ["Customer changed mind", "Wrong item entered", "Item not available", "Quality problem"] as const;
export const REFUND_REASONS = ["Customer complaint", "Wrong item", "Overcharged", "Order cancelled", "Quality problem"] as const;

export const REFUND_METHODS = ["cash", "card", "online", "other"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** A reason: 3 to 200 characters after trimming. */
export const reasonSchema = z.string().trim().min(3, "reason is required").max(200);

/** Order statuses that are finished: nothing can be cancelled, voided or added. */
export const CLOSED_STATUSES = ["cancelled", "completed", "merged"] as const;

type MoneyOrder = { status: string; total: number | string; paid_amount: number | string; refunded_amount?: number | string | null };

/** Pence the customer still owes. Cancelled and merged orders owe nothing; a refunded order is settled. */
export function owedPence(o: MoneyOrder): number {
  if (o.status === "cancelled" || o.status === "merged") return 0;
  return Math.max(0, pence(o.total) - pence(o.paid_amount) - pence(o.refunded_amount ?? 0));
}

/** True if any money was ever taken on the order (net or refunded). */
export const hasPayments = (o: Pick<MoneyOrder, "paid_amount" | "refunded_amount">): boolean =>
  pence(o.paid_amount) > 0 || pence(o.refunded_amount ?? 0) > 0;

/**
 * Who may cancel: any staff a 'new' order with no money taken; anything else open
 * needs cancel_order (owner/manager). Completed, merged and cancelled orders: nobody.
 * The database function (cancel_order_tx) checks the same rule under a row lock.
 */
export function cancelNeeds(o: { status: string; paid_amount: number | string; refunded_amount?: number | string | null }): "anyone" | "manager" | "closed" {
  if ((CLOSED_STATUSES as readonly string[]).includes(o.status)) return "closed";
  if (o.status === "new" && !hasPayments(o)) return "anyone";
  return "manager";
}

/** computeBill kind of a saved order: a table order is dine-in, then delivery, else takeaway. */
export function kindOfOrder(o: { table_session_id: string | null; fulfilment_type: string }): OrderKind {
  if (o.table_session_id) return "dine_in";
  return o.fulfilment_type === "delivery" ? "delivery" : "takeaway";
}

/**
 * The order's discount made to fit a smaller subtotal (after a void), so computeBill
 * accepts it. Fixed: at most the subtotal and the restaurant cap (max_discount_percent),
 * rounded down to whole pence; if nothing is left it becomes 'none'. Percent: at most the
 * cap (a percent of the subtotal can never exceed the subtotal). `clamped` says if it changed.
 */
export function clampDiscount(
  subtotalPence: number,
  settings: Pick<BillSettingsRow, "max_discount_percent">,
  d: DiscountInput,
): { discount: DiscountInput; clamped: boolean } {
  const maxPercent = Number(settings.max_discount_percent);
  const none: DiscountInput = { type: "none", value: 0, reason: null };
  if (d.type === "none") return { discount: none, clamped: false };
  if (!Number.isFinite(maxPercent) || maxPercent <= 0 || subtotalPence <= 0) return { discount: none, clamped: true };

  if (d.type === "percent") {
    if (d.value <= maxPercent) return { discount: d, clamped: false };
    return { discount: { ...d, value: maxPercent }, clamped: true };
  }
  const capPence = Math.floor((subtotalPence * Math.round(maxPercent * 100)) / 10000);
  const wanted = pence(d.value);
  const allowed = Math.min(wanted, capPence, subtotalPence);
  if (allowed === wanted) return { discount: d, clamped: false };
  if (allowed <= 0) return { discount: none, clamped: true };
  return { discount: { ...d, value: allowed / 100 }, clamped: true };
}

/**
 * The part of a refund that was sales (tax taken out in the same share as the bill):
 * refund x (total - tax) / total, whole pence. Reports take this off net sales and profit.
 */
export function refundSalesPence(o: { total: number | string; tax_amount: number | string | null; refunded_amount?: number | string | null }): number {
  const total = pence(o.total);
  const refunded = pence(o.refunded_amount ?? 0);
  if (total <= 0 || refunded <= 0) return 0;
  const exTax = Math.max(0, total - pence(o.tax_amount ?? 0));
  return Math.round((Math.min(refunded, total) * exTax) / total);
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
};
