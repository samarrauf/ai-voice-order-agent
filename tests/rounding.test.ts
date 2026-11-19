import { describe, expect, it } from "vitest";
import { billForResponse, computeBill, type Bill, type BillSettingsRow, type DiscountInput } from "@/lib/order-pricing";

// P9a-A: the rounding step in computeBill. Pure tests, no database.
// All figures are whole minor units (pence / paisa): 125050 = 1250.50.

const settings = (o: Partial<BillSettingsRow> = {}): BillSettingsRow =>
  ({
    delivery_fee: 0,
    tax_rate_percent: 0,
    service_charge_percent: 0,
    service_charge_applies_to: "none",
    max_discount_percent: 0,
    ...o,
  }) as BillSettingsRow;

const bill = (sub: number, kind: Parameters<typeof computeBill>[1], s: BillSettingsRow, d?: DiscountInput | null) => {
  const r = computeBill(sub, kind, s, d);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.bill;
};

/** What the bill was BEFORE rounding existed: the five parts added up. */
const parts = (b: Bill) => b.subtotalPence - b.discountPence + b.deliveryPence + b.serviceChargePence + b.taxPence;

describe("rounding step 0.01 (Napoli): nothing changes", () => {
  const cases: [number, "delivery" | "dine_in" | "takeaway", Partial<BillSettingsRow>][] = [
    [2825, "delivery", { delivery_fee: 3.75, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all" }],
    [1999, "takeaway", { tax_rate_percent: 20 }],
    [10050, "dine_in", { service_charge_percent: 10, service_charge_applies_to: "dine_in" }],
    [1, "takeaway", {}],
    [0, "takeaway", {}],
  ];

  it.each(cases)("subtotal %i, %s: rounding is 0 and total is the sum of the parts", (sub, kind, over) => {
    for (const step of [undefined, 0.01]) {
      const b = bill(sub, kind, settings({ ...over, ...(step ? { rounding_step: step } : {}) }));
      expect(b.roundingPence).toBe(0);
      expect(b.totalPence).toBe(parts(b));
    }
  });

  it("the worked example from the parity test is still 39.08", () => {
    const b = bill(2825, "delivery", settings({ delivery_fee: 3.75, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", rounding_step: 0.01 }));
    expect([b.serviceChargePence, b.taxPence, b.totalPence, b.roundingPence]).toEqual([353, 355, 3908, 0]);
  });
});

describe("rounding step 1 (whole rupees)", () => {
  it("under half goes down, half or more goes up", () => {
    // subtotal only, no extras: the raw total is the subtotal itself.
    expect(bill(125049, "takeaway", settings({ rounding_step: 1 }))).toMatchObject({ totalPence: 125000, roundingPence: -49 });
    expect(bill(125050, "takeaway", settings({ rounding_step: 1 }))).toMatchObject({ totalPence: 125100, roundingPence: 50 });
    expect(bill(125051, "takeaway", settings({ rounding_step: 1 }))).toMatchObject({ totalPence: 125100, roundingPence: 49 });
    expect(bill(125000, "takeaway", settings({ rounding_step: 1 }))).toMatchObject({ totalPence: 125000, roundingPence: 0 });
  });

  it("the hand-worked PKR bill: 3017.12 becomes 3017 (rounding -0.12)", () => {
    // food 2304.75, delivery 150, service 12.5% = 288.09, tax 10% of 2742.84 = 274.28 -> raw 3017.12
    const b = bill(230475, "delivery", settings({ delivery_fee: 150, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all", rounding_step: 1 }));
    expect([b.serviceChargePence, b.taxPence]).toEqual([28809, 27428]);
    expect([b.totalPence, b.roundingPence]).toEqual([301700, -12]);
  });

  it("and 2454.75 becomes 2455 (rounding +0.25)", () => {
    const b = bill(230475, "delivery", settings({ delivery_fee: 150, rounding_step: 1 }));
    expect([b.totalPence, b.roundingPence]).toEqual([245500, 25]);
  });
});

describe("rounding step 0.5", () => {
  it("rounds to the nearest 50 paisa, half up", () => {
    expect(bill(1224, "takeaway", settings({ rounding_step: 0.5 }))).toMatchObject({ totalPence: 1200, roundingPence: -24 });
    expect(bill(1225, "takeaway", settings({ rounding_step: 0.5 }))).toMatchObject({ totalPence: 1250, roundingPence: 25 });
    expect(bill(1275, "takeaway", settings({ rounding_step: 0.5 }))).toMatchObject({ totalPence: 1300, roundingPence: 25 });
  });
});

describe("the identity holds for every combination", () => {
  const subtotals = [1, 49, 50, 99, 100, 101, 1999, 2825, 10050, 125049, 125050, 230475, 999999];
  const kinds = ["delivery", "dine_in", "takeaway"] as const;
  const steps = [0.01, 0.5, 1];
  const charges = [
    { delivery_fee: 2.5, tax_rate_percent: 0, service_charge_percent: 0, service_charge_applies_to: "none" },
    { delivery_fee: 150, tax_rate_percent: 10, service_charge_percent: 12.5, service_charge_applies_to: "all" },
    { delivery_fee: 3.75, tax_rate_percent: 17.5, service_charge_percent: 10, service_charge_applies_to: "dine_in" },
  ];
  const discounts: (DiscountInput | null)[] = [null, { type: "percent", value: 10, reason: null }, { type: "fixed", value: 0.55, reason: null }];

  it("subtotal - discount + delivery + service + tax + rounding = total, total is a multiple of the step, |rounding| <= half a step", () => {
    let checked = 0;
    for (const sub of subtotals)
      for (const kind of kinds)
        for (const step of steps)
          for (const c of charges)
            for (const d of discounts) {
              const r = computeBill(sub, kind, settings({ ...c, max_discount_percent: 100, rounding_step: step }), d);
              if (!r.ok) continue; // e.g. a fixed discount bigger than a tiny subtotal is refused, as before
              const b = r.bill;
              checked++;
              const stepPence = Math.round(step * 100);
              expect(b.subtotalPence - b.discountPence + b.deliveryPence + b.serviceChargePence + b.taxPence + b.roundingPence).toBe(b.totalPence);
              expect(b.totalPence % stepPence).toBe(0);
              const raw = b.totalPence - b.roundingPence;
              if (stepPence === 1) expect(b.roundingPence).toBe(0);
              else if (raw > 0 && raw * 2 < stepPence) expect(b.totalPence).toBe(stepPence); // never rounds down to a free order
              else expect(Math.abs(b.roundingPence)).toBeLessThanOrEqual(Math.ceil(stepPence / 2));
              expect(b.totalPence).toBeGreaterThanOrEqual(0);
            }
    expect(checked).toBeGreaterThan(500);
  });
});

describe("rounding never changes the discount rules", () => {
  const s = (step: number) => settings({ max_discount_percent: 10, rounding_step: step });

  it("the same discount, in pence, at every step", () => {
    const d: DiscountInput = { type: "percent", value: 10, reason: null };
    const a = bill(10050, "takeaway", s(0.01), d);
    const b = bill(10050, "takeaway", s(1), d);
    expect(b.discountPence).toBe(a.discountPence);
    expect(a.discountPence).toBe(1005); // 10% of 100.50
  });

  it("over the cap is refused at every step, by the same rule", () => {
    for (const step of [0.01, 0.5, 1]) {
      expect(computeBill(10050, "takeaway", s(step), { type: "percent", value: 10.01, reason: null }).ok).toBe(false);
      expect(computeBill(10050, "takeaway", s(step), { type: "fixed", value: 10.06, reason: null }).ok).toBe(false);
      expect(computeBill(10050, "takeaway", s(step), { type: "fixed", value: 10.05, reason: null }).ok).toBe(true);
    }
  });

  it("a 100% discount is still a zero total, not rounded up to a step", () => {
    const b = bill(10050, "takeaway", settings({ max_discount_percent: 100, rounding_step: 1 }), { type: "percent", value: 100, reason: null });
    expect([b.totalPence, b.roundingPence]).toEqual([0, 0]);
  });
});

describe("safety", () => {
  it("a positive bill never rounds down to a free order", () => {
    const b = bill(20, "takeaway", settings({ rounding_step: 1 })); // 0.20 would round to 0
    expect(b.totalPence).toBe(100);
    expect(b.roundingPence).toBe(80);
  });

  it("a rounding_step that is not 0.01, 0.5 or 1 is refused", () => {
    for (const step of [0.25, 0, -1, 2, Number.NaN]) {
      expect(computeBill(1000, "takeaway", settings({ rounding_step: step })).ok).toBe(false);
    }
  });

  it("a fixed discount above the currency's limit is refused (GBP), allowed for PKR", () => {
    const big = { type: "fixed", value: 150000, reason: null } as const;
    expect(computeBill(20000000, "takeaway", settings({ max_discount_percent: 100, currency: "GBP" }), big).ok).toBe(false);
    expect(computeBill(20000000, "takeaway", settings({ max_discount_percent: 100, currency: "PKR" }), big).ok).toBe(true);
  });

  it("billForResponse carries the rounding in whole currency units", () => {
    const b = bill(230475, "delivery", settings({ delivery_fee: 150, rounding_step: 1 }));
    expect(billForResponse(b)).toMatchObject({ subtotal: 2304.75, delivery_fee: 150, rounding: 0.25, total: 2455 });
    const n = bill(1000, "takeaway", settings());
    expect(billForResponse(n).rounding).toBe(0);
  });
});
