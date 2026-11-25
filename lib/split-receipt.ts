import { computeSplit, guestsIn, paidByGuestPence, splitOrderFromPrint, type SplitErrorCode, type SplitSpec } from "@/lib/bill-split";
import { formatMoney } from "@/lib/money";
import { buildReceipt, type PrintInput, type ReceiptLine, type ReceiptModel, type ReceiptRow } from "@/lib/receipt";

// B4c: one 80mm receipt per guest of a split bill. PURE. The top (brand, order,
// date, table) is the normal receipt's; the items, the bill rows and the payments
// are only this guest's. Money is formatted only through formatMoney.

export type GuestReceipt = ReceiptModel & {
  /** "Part of Order A-1025 · Guest 2 of 3" */
  partOf: string;
  /** "amounts" split: a share of the bill without its own items. */
  shareOnly: boolean;
};

export function buildSplitReceipts(
  input: PrintInput,
  spec: SplitSpec,
): { ok: true; receipts: GuestReceipt[] } | { ok: false; error: SplitErrorCode; guest?: number } {
  const order = splitOrderFromPrint(input, input.restaurant.rounding_step);
  const split = computeSplit(order, spec);
  if (!split.ok) return split;

  const base = buildReceipt(input);
  const cur = input.restaurant.currency || undefined;
  const money = (p: number) => formatMoney(p / 100, cur);
  const lineById = new Map(order.lines.map((l) => [l.id, l]));
  const n = guestsIn(spec);
  const o = input.order;

  const receipts = split.guests.map((g): GuestReceipt => {
    const lines: ReceiptLine[] = g.pieces.map((p) => {
      const l = lineById.get(p.lineId)!;
      const detail = p.sharedWith > 1 ? [...l.detail, `Shared by ${p.sharedWith}`] : l.detail;
      return { quantity: l.quantity, name: l.name, detail, lineTotal: money(p.pence) };
    });

    const rows: ReceiptRow[] = [{ label: "Subtotal", value: money(g.subtotalPence) }];
    if (g.discountPence > 0) {
      const pct = o.discount_type === "percent" && Number(o.discount_value) > 0 ? ` (${Number(o.discount_value)}%)` : "";
      rows.push({ label: `Discount${pct}`, value: `-${money(g.discountPence)}`, kind: "discount" });
    }
    if (g.deliveryPence > 0) rows.push({ label: "Delivery", value: money(g.deliveryPence) });
    if (g.servicePence > 0) rows.push({ label: "Service charge", value: money(g.servicePence) });
    if (g.taxPence > 0) rows.push({ label: "Tax", value: money(g.taxPence) });
    if (g.roundingPence !== 0) rows.push({ label: "Rounding", value: money(g.roundingPence) });
    rows.push({ label: "TOTAL", value: money(g.totalPence), kind: "total" });

    const mine = input.payments.filter((p) => (p.kind ?? "payment") === "payment" && p.payer_label === g.label);
    const paidPence = paidByGuestPence(input.payments, g.label);
    const balancePence = base.cancelled ? 0 : Math.max(0, g.totalPence - paidPence);
    const status = balancePence === 0 && paidPence > 0 ? "paid" : paidPence > 0 ? "partial" : "unpaid";
    const methodLabel = (m: string) => ({ cash: "Cash", card: "Card", online: "Online", other: "Other" })[m] ?? m;

    return {
      ...base,
      lines,
      rows,
      payments: mine.map((p) => ({ label: methodLabel(p.method), amount: formatMoney(Number(p.amount), cur) })),
      paid: money(paidPence),
      balanceDue: money(balancePence),
      paymentStatus: status,
      paymentStatusLabel: { paid: "Paid", partial: "Partial", unpaid: "Unpaid" }[status],
      partOf: `Part of Order ${base.orderNumber} · ${g.label} of ${n}`,
      shareOnly: spec.mode === "amounts",
    };
  });
  return { ok: true, receipts };
}
