import { describe, expect, it } from "vitest";
import { paidByGuestPence, splitOrderFromPrint, type SplitSpec } from "@/lib/bill-split";
import { buildReceipt, type PrintInput } from "@/lib/receipt";
import { buildSplitReceipts } from "@/lib/split-receipt";

// B4c: split bill receipts. No database calls, but lib/receipt.ts pulls in the
// server Supabase client (via branding), so this runs in the normal suite.

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function printInput(): PrintInput {
  return {
    restaurant: { name: "Test Grill", currency: "GBP", timezone: "Europe/London", rounding_step: 0.01 },
    order: {
      order_number: "A-1025",
      created_at: "2026-11-25T12:00:00Z",
      fulfilment_type: "pickup",
      source: "walk_in",
      table_session_id: "s1",
      table_number: "7",
      subtotal: 30,
      discount_type: "percent",
      discount_value: 10,
      discount_amount: 3,
      delivery_fee: 0,
      service_charge_amount: 2.7,
      tax_amount: 5.94,
      rounding_amount: 0,
      total: 35.64,
      payment_status: "partial",
      paid_amount: 10,
      notes: "no onions",
    },
    items: [
      { id: ID(1), item_name: "Margherita", size_name: "12 inch", options: [{ name: "Extra cheese" }], quantity: 1, line_total: 12 },
      { id: ID(2), item_name: "Garlic bread", quantity: 2, line_total: 9 },
      { id: ID(3), item_name: "Cola", quantity: 3, line_total: 9 },
      { id: ID(4), item_name: "Voided", quantity: 1, line_total: 5, voided_at: "2026-11-25T12:05:00Z" },
    ],
    payments: [
      { kind: "payment", method: "card", amount: 10, payer_label: "Guest 2" },
      { kind: "payment", method: "cash", amount: 1, payer_label: null },
    ],
  };
}

describe("split receipts", () => {
  it("one receipt per guest, headed 'Part of Order A-1025 · Guest 2 of 3', only their items", () => {
    const input = printInput();
    const spec: SplitSpec = { mode: "items", guests: 3, assign: { [ID(1)]: [1], [ID(2)]: [2, 3], [ID(3)]: [3] } };
    const built = buildSplitReceipts(input, spec);
    if (!built.ok) throw new Error(built.error);
    expect(built.receipts).toHaveLength(3);
    expect(built.receipts[1].partOf).toBe("Part of Order A-1025 · Guest 2 of 3");
    expect(built.receipts[0].lines.map((l) => l.name)).toEqual(["Margherita"]);
    expect(built.receipts[0].lines[0].detail).toEqual(["12 inch", "Extra cheese"]);
    expect(built.receipts[1].lines.map((l) => l.name)).toEqual(["Garlic bread"]);
    expect(built.receipts[1].lines[0].detail).toEqual(["Shared by 2"]);
    expect(built.receipts[1].lines[0].lineTotal).toBe("£4.50");
    expect(built.receipts.flatMap((r) => r.lines).some((l) => l.name === "Voided")).toBe(false);
    // Same brand/order header as the full receipt.
    expect(built.receipts[2].orderNumber).toBe("A-1025");
    expect(built.receipts[2].table).toBe("7");
  });

  it("each receipt's TOTAL rows add up to the order total; only the guest's own payments show", () => {
    const input = printInput();
    const built = buildSplitReceipts(input, { mode: "equal", guests: 3 });
    if (!built.ok) throw new Error(built.error);
    const totals = built.receipts.map((r) => r.rows.find((x) => x.kind === "total")!.value);
    const pence = totals.map((t) => Math.round(Number(t.replace(/[^0-9.]/g, "")) * 100));
    expect(sum(pence)).toBe(3564);
    expect(built.receipts[0].rows.map((r) => r.label)).toEqual(["Subtotal", "Discount (10%)", "Service charge", "Tax", "TOTAL"]);
    expect(built.receipts[1].payments).toEqual([{ label: "Card", amount: "£10.00" }]);
    expect(built.receipts[1].paid).toBe("£10.00");
    expect(built.receipts[1].paymentStatus).toBe("partial");
    expect(built.receipts[0].payments).toEqual([]);
    expect(built.receipts[0].paymentStatus).toBe("unpaid");
    expect(built.receipts[0].balanceDue).toBe(totals[0]);
  });

  it("amounts split: a share of the bill without items", () => {
    const built = buildSplitReceipts(printInput(), { mode: "amounts", amounts: [2000, 1564] });
    if (!built.ok) throw new Error(built.error);
    expect(built.receipts[0].shareOnly).toBe(true);
    expect(built.receipts[0].lines).toEqual([]);
    expect(built.receipts[1].rows.at(-1)).toEqual({ label: "TOTAL", value: "£15.64", kind: "total" });
  });

  it("a split that no longer matches the order is refused, not printed wrong", () => {
    expect(buildSplitReceipts(printInput(), { mode: "amounts", amounts: [2000, 1000] })).toMatchObject({ ok: false });
    expect(buildSplitReceipts(printInput(), { mode: "items", guests: 2, assign: { [ID(1)]: [1], [ID(2)]: [2] } })).toMatchObject({
      ok: false,
      error: "item_not_assigned",
    });
  });

  it("the full bill is unchanged: all live items, the note, all payments", () => {
    const r = buildReceipt(printInput());
    expect(r.lines.map((l) => l.name)).toEqual(["Margherita", "Garlic bread", "Cola"]);
    expect(r.notes).toBe("no onions");
    expect(r.payments).toHaveLength(2);
    expect(r.rows.at(-1)).toEqual({ label: "TOTAL", value: "£35.64", kind: "total" });
  });

  it("paidByGuestPence counts only that guest's payments, not refunds", () => {
    const p: PrintInput["payments"] = [
      { kind: "payment", method: "cash", amount: 5.5, payer_label: "Guest 1" },
      { kind: "payment", method: "card", amount: 2.25, payer_label: "Guest 1" },
      { kind: "refund", method: "card", amount: 2.25, payer_label: "Guest 1" },
      { kind: "payment", method: "card", amount: 9, payer_label: "Guest 2" },
    ];
    expect(paidByGuestPence(p, "Guest 1")).toBe(775);
    expect(paidByGuestPence(p, "Guest 3")).toBe(0);
  });

  it("splitOrderFromPrint leaves voided lines out and reads the step", () => {
    const o = splitOrderFromPrint(printInput(), 1);
    expect(o.lines.map((l) => l.id)).toEqual([ID(1), ID(2), ID(3)]);
    expect(o.stepPence).toBe(100);
    expect(o.totalPence).toBe(3564);
  });
});
