import { describe, expect, it } from "vitest";
import { cancelNeeds, clampDiscount, hasPayments, kindOfOrder, owedPence, reasonSchema, refundSalesPence } from "@/lib/order-adjust";
import { computeBill, type BillSettingsRow } from "@/lib/order-pricing";
import { orderSalesPence, totalsFor, type StatsOrder } from "@/lib/dashboard-stats";
import { orderProfit, summarizeProfit } from "@/lib/profit";
import { can } from "@/lib/permissions";

// B4b pure rules: discount clamp after a void, owed/settled money, cancel rules,
// and the effect of refunds and cancels on sales and profit. Network-free.

const settings: BillSettingsRow = {
  delivery_fee: 0,
  tax_rate_percent: 20,
  service_charge_percent: 0,
  service_charge_applies_to: "none",
  max_discount_percent: 50,
  rounding_step: 0.01,
  currency: "GBP",
};

describe("clampDiscount (after a void)", () => {
  it("leaves a discount that still fits alone", () => {
    const d = { type: "fixed" as const, value: 2, reason: "r" };
    expect(clampDiscount(1000, settings, d)).toEqual({ discount: d, clamped: false });
  });

  it("shrinks a fixed discount to the cap of the new subtotal, and computeBill then accepts it", () => {
    const d = { type: "fixed" as const, value: 6, reason: "r" };
    // Before the void: 13.50, cap 6.75, so 6.00 was fine. After: 3.50, cap 1.75.
    expect(computeBill(350, "dine_in", settings, d).ok).toBe(false);
    const c = clampDiscount(350, settings, d);
    expect(c).toEqual({ discount: { type: "fixed", value: 1.75, reason: "r" }, clamped: true });
    const b = computeBill(350, "dine_in", settings, c.discount);
    expect(b.ok && b.bill.discountPence).toBe(175);
  });

  it("rounds the cap down to whole pence (odd subtotal)", () => {
    const c = clampDiscount(333, settings, { type: "fixed", value: 5, reason: null });
    expect(c.discount.value).toBe(1.66); // floor(333 x 50%) = 166p
  });

  it("drops a percent above the (lowered) cap to the cap", () => {
    const c = clampDiscount(1000, { max_discount_percent: 10 }, { type: "percent", value: 25, reason: null });
    expect(c).toEqual({ discount: { type: "percent", value: 10, reason: null }, clamped: true });
  });

  it("a zero cap removes the discount", () => {
    expect(clampDiscount(1000, { max_discount_percent: 0 }, { type: "fixed", value: 1, reason: null })).toEqual({
      discount: { type: "none", value: 0, reason: null },
      clamped: true,
    });
  });

  it("no discount stays none", () => {
    expect(clampDiscount(1000, settings, { type: "none", value: 0, reason: null }).clamped).toBe(false);
  });
});

describe("owed and settled money", () => {
  it("owed = total - net paid - refunded, never below 0", () => {
    expect(owedPence({ status: "new", total: 20, paid_amount: 5, refunded_amount: 0 })).toBe(1500);
    expect(owedPence({ status: "completed", total: 20, paid_amount: 15, refunded_amount: 5 })).toBe(0); // refunded bill is settled
    expect(owedPence({ status: "completed", total: 20, paid_amount: 0, refunded_amount: 20 })).toBe(0);
  });
  it("a cancelled or merged order owes nothing", () => {
    expect(owedPence({ status: "cancelled", total: 20, paid_amount: 0 })).toBe(0);
    expect(owedPence({ status: "merged", total: 20, paid_amount: 0 })).toBe(0);
  });
  it("hasPayments sees net or refunded money", () => {
    expect(hasPayments({ paid_amount: 0, refunded_amount: 0 })).toBe(false);
    expect(hasPayments({ paid_amount: 0, refunded_amount: 3 })).toBe(true);
  });
});

describe("cancel rules", () => {
  it("staff only a new order with no money; manager the rest; closed never", () => {
    expect(cancelNeeds({ status: "new", paid_amount: 0 })).toBe("anyone");
    expect(cancelNeeds({ status: "new", paid_amount: 1 })).toBe("manager");
    expect(cancelNeeds({ status: "new", paid_amount: 0, refunded_amount: 2 })).toBe("manager");
    for (const s of ["accepted", "preparing", "ready"]) expect(cancelNeeds({ status: s, paid_amount: 0 })).toBe("manager");
    for (const s of ["completed", "cancelled", "merged"]) expect(cancelNeeds({ status: s, paid_amount: 0 })).toBe("closed");
  });
  it("capabilities: cancel/refund/void are owner and manager only", () => {
    for (const cap of ["cancel_order", "refund_payment", "void_item"] as const) {
      expect(can("owner", cap)).toBe(true);
      expect(can("manager", cap)).toBe(true);
      expect(can("staff", cap)).toBe(false);
    }
  });
  it("a reason is required (3+ characters, trimmed)", () => {
    expect(reasonSchema.safeParse("  ").success).toBe(false);
    expect(reasonSchema.safeParse("ab").success).toBe(false);
    expect(reasonSchema.safeParse(" Wrong order ").data).toBe("Wrong order");
  });
  it("kindOfOrder: table = dine-in, then delivery, else takeaway", () => {
    expect(kindOfOrder({ table_session_id: "x", fulfilment_type: "pickup" })).toBe("dine_in");
    expect(kindOfOrder({ table_session_id: null, fulfilment_type: "delivery" })).toBe("delivery");
    expect(kindOfOrder({ table_session_id: null, fulfilment_type: "pickup" })).toBe("takeaway");
  });
});

describe("reports: refunds come off net sales and profit, cancelled orders are out", () => {
  const at = "2026-11-25T12:00:00Z";
  const base: StatsOrder = { status: "completed", fulfilment_type: "pickup", source: "walk_in", table_session_id: null, total: 12, tax_amount: 2, paid_amount: 12, created_at: at };

  it("refundSalesPence takes the tax share out of the refund", () => {
    expect(refundSalesPence({ total: 12, tax_amount: 2, refunded_amount: 6 })).toBe(500); // half the bill, half the 10.00 sales
    expect(refundSalesPence({ total: 12, tax_amount: 2, refunded_amount: 0 })).toBe(0);
    expect(refundSalesPence({ total: 0, tax_amount: 0, refunded_amount: 0 })).toBe(0);
  });

  it("sales of a part-refunded and a fully refunded order", () => {
    expect(orderSalesPence(base)).toBe(1000);
    expect(orderSalesPence({ ...base, refunded_amount: 6 })).toBe(500);
    expect(orderSalesPence({ ...base, refunded_amount: 12 })).toBe(0);
    expect(orderSalesPence({ ...base, status: "cancelled", refunded_amount: 12 })).toBe(0);
  });

  it("totalsFor: refunded money is not billed, cancelled orders are not counted", () => {
    const t = totalsFor(
      [base, { ...base, paid_amount: 6, refunded_amount: 6 }, { ...base, status: "cancelled", paid_amount: 0, refunded_amount: 12 }],
      new Date("2026-11-25T00:00:00Z"),
      new Date("2026-11-26T00:00:00Z"),
    );
    expect(t.orders).toBe(2);
    expect(t.salesPence).toBe(1500);
    expect(t.billedPence).toBe(1800);
    expect(t.paidPence).toBe(1800);
  });

  it("summarizeProfit and orderProfit take the refund off; cancelled orders stay out", () => {
    const o = { status: "completed", subtotal: 10, discount_amount: 0, tax_amount: 2, total: 12, cost_total: 4, cost_complete: true };
    const s = summarizeProfit([o, { ...o, refunded_amount: 6 }, { ...o, status: "cancelled", refunded_amount: 12 }], []);
    expect(s.orders).toBe(2);
    expect(s.sales).toBe(15);
    expect(s.grossProfit).toBe(6 + 1); // 10-4 and 10-4-5
    expect(orderProfit({ ...o, refunded_amount: 6 })).toBe(1);
    expect(orderProfit(o)).toBe(6);
  });
});
