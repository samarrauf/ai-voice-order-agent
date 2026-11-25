import { describe, expect, it } from "vitest";
import {
  allocate,
  computeSplit,
  decodeSplit,
  encodeSplit,
  splitSpecSchema,
  type GuestShare,
  type SplitOrder,
  type SplitSpec,
} from "@/lib/bill-split";
import { computeBill, type BillSettingsRow, type OrderKind } from "@/lib/order-pricing";

// B4c: bill split. Network-free. THE RULE under test everywhere: the guests'
// shares add up to EXACTLY the order total, and every part of the bill too.

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A deterministic random generator (mulberry32), so failures are repeatable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SETTINGS: BillSettingsRow = {
  delivery_fee: 2.5,
  tax_rate_percent: 0,
  service_charge_percent: 0,
  service_charge_applies_to: "dine_in",
  max_discount_percent: 50,
  rounding_step: 0.01,
  currency: "GBP",
};

/** An order made the real way: lines -> computeBill. */
function orderOf(
  linePence: number[],
  opts: { settings?: Partial<BillSettingsRow>; kind?: OrderKind; discount?: { type: "percent" | "fixed"; value: number } } = {},
): SplitOrder {
  const settings = { ...SETTINGS, ...opts.settings };
  const sub = sum(linePence);
  const r = computeBill(sub, opts.kind ?? "dine_in", settings, opts.discount ? { ...opts.discount, reason: null } : null);
  if (!r.ok) throw new Error(r.error);
  const b = r.bill;
  return {
    lines: linePence.map((p, i) => ({ id: ID(i + 1), name: `Item ${i + 1}`, quantity: 1, detail: [], linePence: p })),
    subtotalPence: b.subtotalPence,
    discountPence: b.discountPence,
    deliveryPence: b.deliveryPence,
    servicePence: b.serviceChargePence,
    taxPence: b.taxPence,
    roundingPence: b.roundingPence,
    totalPence: b.totalPence,
    stepPence: Math.round(Number(settings.rounding_step ?? 0.01) * 100),
  };
}

/** Every invariant of a good split. */
function expectExact(order: SplitOrder, guests: GuestShare[], n: number) {
  expect(guests).toHaveLength(n);
  expect(sum(guests.map((g) => g.totalPence))).toBe(order.totalPence);
  expect(sum(guests.map((g) => g.subtotalPence))).toBe(order.subtotalPence);
  expect(sum(guests.map((g) => g.discountPence))).toBe(order.discountPence);
  expect(sum(guests.map((g) => g.deliveryPence))).toBe(order.deliveryPence);
  expect(sum(guests.map((g) => g.servicePence))).toBe(order.servicePence);
  expect(sum(guests.map((g) => g.taxPence))).toBe(order.taxPence);
  expect(sum(guests.map((g) => g.roundingPence))).toBe(order.roundingPence);
  for (const g of guests) {
    expect(g.totalPence).toBeGreaterThan(0);
    expect(Number.isInteger(g.totalPence)).toBe(true);
    // Each guest's own bill adds up, just like the order's.
    expect(g.subtotalPence - g.discountPence + g.deliveryPence + g.servicePence + g.taxPence + g.roundingPence).toBe(g.totalPence);
    for (const v of [g.subtotalPence, g.discountPence, g.deliveryPence, g.servicePence, g.taxPence]) expect(v).toBeGreaterThanOrEqual(0);
  }
  // Every line's pieces add up to the line.
  const byLine = new Map<string, number>();
  for (const g of guests) for (const p of g.pieces) byLine.set(p.lineId, (byLine.get(p.lineId) ?? 0) + p.pence);
  for (const l of order.lines) if (byLine.size) expect(byLine.get(l.id)).toBe(l.linePence);
}

const ok = (order: SplitOrder, spec: SplitSpec) => {
  const r = computeSplit(order, spec);
  if (!r.ok) throw new Error(`split failed: ${r.error}`);
  return r.guests;
};

describe("allocate (largest remainder)", () => {
  it("adds up exactly and follows the weights", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [1, 2, 7])).toEqual([1, 2, 7]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(0, [3, 4])).toEqual([0, 0]);
    expect(allocate(7, [0, 5, 0])).toEqual([0, 7, 0]);
  });
  it("gives the odd unit to the biggest remainder, ties to the earlier guest", () => {
    expect(allocate(10, [1, 2])).toEqual([3, 7]); // 3.33 / 6.67 -> 6.67 rounds up
    expect(allocate(5, [1, 1, 1, 1])).toEqual([2, 1, 1, 1]);
  });
  it("never loses precision on big numbers", () => {
    const w = [999_999_937, 999_999_929, 1];
    const parts = allocate(987_654_321, w);
    expect(sum(parts)).toBe(987_654_321);
  });
  it("refuses bad input", () => {
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
    expect(() => allocate(10, [0, 0])).toThrow();
    expect(() => allocate(10, [1, -1])).toThrow();
  });
  it("matches the sum for many random cases", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const n = 2 + Math.floor(r() * 10);
      const w = Array.from({ length: n }, () => Math.floor(r() * 5000));
      if (sum(w) === 0) continue;
      const total = Math.floor(r() * 1_000_000);
      const parts = allocate(total, w);
      expect(sum(parts)).toBe(total);
      parts.forEach((p, k) => {
        if (w[k] === 0) expect(p).toBe(0);
        // Each part is within one unit of its exact share.
        expect(Math.abs(p - (total * w[k]) / sum(w))).toBeLessThan(1);
      });
    }
  });
});

describe("equal split: 2, 3 and 7 guests", () => {
  for (const n of [2, 3, 7]) {
    it(`${n} guests, plain bill`, () => {
      const order = orderOf([1099, 899, 450]);
      const guests = ok(order, { mode: "equal", guests: n });
      expectExact(order, guests, n);
      const totals = guests.map((g) => g.totalPence);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    });
    it(`${n} guests with discount, service charge and tax`, () => {
      const order = orderOf([1250, 1399, 875, 600], {
        settings: { service_charge_percent: 12.5, tax_rate_percent: 20 },
        discount: { type: "percent", value: 10 },
      });
      expect(order.discountPence).toBeGreaterThan(0);
      expect(order.servicePence).toBeGreaterThan(0);
      expect(order.taxPence).toBeGreaterThan(0);
      const guests = ok(order, { mode: "equal", guests: n });
      expectExact(order, guests, n);
      const totals = guests.map((g) => g.totalPence);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    });
  }

  it("3 guests of 10.00 -> 3.34 + 3.33 + 3.33", () => {
    const order = orderOf([1000]);
    expect(ok(order, { mode: "equal", guests: 3 }).map((g) => g.totalPence)).toEqual([334, 333, 333]);
  });

  it("delivery fee and a fixed discount are shared too", () => {
    const order = orderOf([2000, 1500], { kind: "delivery", discount: { type: "fixed", value: 3.33 } });
    expect(order.deliveryPence).toBe(250);
    expectExact(order, ok(order, { mode: "equal", guests: 3 }), 3);
  });
});

describe("rounding step", () => {
  it("PKR step 1: every share is a whole rupee and they add up to the total", () => {
    const order = orderOf([125_000, 89_950, 45_025], {
      settings: { currency: "PKR", rounding_step: 1, tax_rate_percent: 16, service_charge_percent: 5 },
      discount: { type: "percent", value: 7.5 },
    });
    expect(order.totalPence % 100).toBe(0);
    for (const n of [2, 3, 7]) {
      const guests = ok(order, { mode: "equal", guests: n });
      expectExact(order, guests, n);
      for (const g of guests) expect(g.totalPence % 100).toBe(0);
    }
  });

  it("step 0.01: shares are whole pence and the rounding parts are all 0", () => {
    const order = orderOf([999, 1], { settings: { tax_rate_percent: 20 } });
    const guests = ok(order, { mode: "equal", guests: 3 });
    expectExact(order, guests, 3);
    for (const g of guests) expect(g.roundingPence).toBe(0);
  });

  it("step 0.5: shares are multiples of 50", () => {
    const order = orderOf([1234, 777], { settings: { rounding_step: 0.5, tax_rate_percent: 5 } });
    const guests = ok(order, { mode: "equal", guests: 3 });
    expectExact(order, guests, 3);
    for (const g of guests) expect(g.totalPence % 50).toBe(0);
  });

  it("an old order whose total is not a multiple of today's step falls back to whole pence", () => {
    const order = { ...orderOf([1001]), stepPence: 100 };
    const guests = ok(order, { mode: "equal", guests: 2 });
    expectExact(order, guests, 2);
    expect(guests.map((g) => g.totalPence)).toEqual([501, 500]);
  });
});

describe("by items", () => {
  it("each guest gets exactly their items, and charges follow their subtotal", () => {
    const order = orderOf([2000, 1000, 500], { settings: { service_charge_percent: 10, tax_rate_percent: 20 } });
    const spec: SplitSpec = { mode: "items", guests: 2, assign: { [ID(1)]: [1], [ID(2)]: [2], [ID(3)]: [2] } };
    const guests = ok(order, spec);
    expectExact(order, guests, 2);
    expect(guests[0].subtotalPence).toBe(2000);
    expect(guests[1].subtotalPence).toBe(1500);
    expect(guests[0].pieces.map((p) => p.lineId)).toEqual([ID(1)]);
    expect(guests[1].pieces.map((p) => p.lineId)).toEqual([ID(2), ID(3)]);
    // 20.00 + 10% + 20% tax = 26.40; 15.00 -> 19.80
    expect(guests.map((g) => g.totalPence)).toEqual([2640, 1980]);
  });

  it("one item shared by several guests is divided in whole pence", () => {
    const order = orderOf([1000, 1201]);
    const spec: SplitSpec = { mode: "items", guests: 3, assign: { [ID(1)]: [1], [ID(2)]: [1, 2, 3] } };
    const guests = ok(order, spec);
    expectExact(order, guests, 3);
    const pieces = guests.flatMap((g) => g.pieces.filter((p) => p.lineId === ID(2)));
    expect(pieces).toHaveLength(3);
    expect(pieces.every((p) => p.sharedWith === 3)).toBe(true);
    expect(sum(pieces.map((p) => p.pence))).toBe(1201);
    // The odd penny goes to a guest with less so far (not guest 1, who has 10.00 already).
    expect(guests[0].pieces.find((p) => p.lineId === ID(2))!.pence).toBe(400);
  });

  it("7 guests, mixed sharing, discount + service + tax + PKR step", () => {
    const lines = [150_000, 99_900, 45_050, 33_300, 12_000, 8_800, 7_700, 5_500];
    const order = orderOf(lines, {
      settings: { currency: "PKR", rounding_step: 1, service_charge_percent: 10, tax_rate_percent: 16 },
      discount: { type: "fixed", value: 500 },
    });
    const spec: SplitSpec = {
      mode: "items",
      guests: 7,
      assign: {
        [ID(1)]: [1, 2],
        [ID(2)]: [3],
        [ID(3)]: [4, 5, 6],
        [ID(4)]: [7],
        [ID(5)]: [1, 2, 3, 4, 5, 6, 7],
        [ID(6)]: [6],
        [ID(7)]: [5],
        [ID(8)]: [2, 7],
      },
    };
    const guests = ok(order, spec);
    expectExact(order, guests, 7);
    for (const g of guests) expect(g.totalPence % 100).toBe(0);
  });

  it("refuses an unassigned item, a guest with nothing, an unknown item, an out-of-range or repeated guest", () => {
    const order = orderOf([1000, 500]);
    expect(computeSplit(order, { mode: "items", guests: 2, assign: { [ID(1)]: [1] } })).toMatchObject({ ok: false, error: "item_not_assigned" });
    expect(computeSplit(order, { mode: "items", guests: 3, assign: { [ID(1)]: [1], [ID(2)]: [2] } })).toMatchObject({
      ok: false,
      error: "guest_without_items",
      guest: 3,
    });
    expect(computeSplit(order, { mode: "items", guests: 2, assign: { [ID(1)]: [1], [ID(2)]: [2], [ID(9)]: [1] } })).toMatchObject({
      ok: false,
      error: "unknown_item",
    });
    expect(computeSplit(order, { mode: "items", guests: 2, assign: { [ID(1)]: [1], [ID(2)]: [3] } })).toMatchObject({
      ok: false,
      error: "guest_out_of_range",
    });
    expect(computeSplit(order, { mode: "items", guests: 2, assign: { [ID(1)]: [1, 1], [ID(2)]: [2] } })).toMatchObject({
      ok: false,
      error: "duplicate_guest",
    });
  });
});

describe("by typed amounts", () => {
  it("takes the amounts as they are when they add up to the total", () => {
    const order = orderOf([1500, 1500], { settings: { service_charge_percent: 10, tax_rate_percent: 20 } });
    const a = 1000;
    const b = order.totalPence - a;
    const guests = ok(order, { mode: "amounts", amounts: [a, b] });
    expectExact(order, guests, 2);
    expect(guests.map((g) => g.totalPence)).toEqual([a, b]);
    expect(guests.every((g) => g.pieces.length === 0)).toBe(true);
  });

  it("refuses amounts that do not add up (under or over)", () => {
    const order = orderOf([1000]);
    expect(computeSplit(order, { mode: "amounts", amounts: [500, 499] })).toMatchObject({ ok: false, error: "amounts_must_equal_total" });
    expect(computeSplit(order, { mode: "amounts", amounts: [500, 501] })).toMatchObject({ ok: false, error: "amounts_must_equal_total" });
  });

  it("PKR step 1: an amount with paisa is refused", () => {
    const order = orderOf([100_000], { settings: { currency: "PKR", rounding_step: 1 } });
    expect(computeSplit(order, { mode: "amounts", amounts: [50_050, 49_950] })).toMatchObject({
      ok: false,
      error: "amount_not_multiple_of_step",
      guest: 1,
    });
    expectExact(order, ok(order, { mode: "amounts", amounts: [60_000, 40_000] }), 2);
  });

  it("a zero or negative amount cannot even be asked for", () => {
    expect(splitSpecSchema.safeParse({ mode: "amounts", amounts: [0, 1000] }).success).toBe(false);
    expect(splitSpecSchema.safeParse({ mode: "amounts", amounts: [-5, 1005] }).success).toBe(false);
    expect(splitSpecSchema.safeParse({ mode: "amounts", amounts: [1.5, 1000] }).success).toBe(false);
  });
});

describe("checks on the order and the split", () => {
  it("refuses an order whose parts do not add up", () => {
    const order = { ...orderOf([1000]), totalPence: 1001 };
    expect(computeSplit(order, { mode: "equal", guests: 2 })).toMatchObject({ ok: false, error: "order_inconsistent" });
    const lines = { ...orderOf([1000]), lines: [{ id: ID(1), name: "x", quantity: 1, detail: [], linePence: 999 }] };
    expect(computeSplit(lines, { mode: "equal", guests: 2 })).toMatchObject({ ok: false, error: "order_inconsistent" });
  });

  it("refuses a free (0) bill", () => {
    const order = orderOf([1000], { settings: { max_discount_percent: 100 }, discount: { type: "percent", value: 100 } });
    expect(order.totalPence).toBe(0);
    expect(computeSplit(order, { mode: "equal", guests: 2 })).toMatchObject({ ok: false, error: "nothing_to_split" });
  });

  it("refuses a split where a guest would pay 0", () => {
    const order = orderOf([1]);
    expect(computeSplit(order, { mode: "equal", guests: 2 })).toMatchObject({ ok: false, error: "guest_without_items", guest: 2 });
  });

  it("schema: 2 to 20 guests only", () => {
    expect(splitSpecSchema.safeParse({ mode: "equal", guests: 1 }).success).toBe(false);
    expect(splitSpecSchema.safeParse({ mode: "equal", guests: 21 }).success).toBe(false);
    expect(splitSpecSchema.safeParse({ mode: "equal", guests: 20 }).success).toBe(true);
    expect(splitSpecSchema.safeParse({ mode: "items", guests: 2, assign: { "not-a-uuid": [1] } }).success).toBe(false);
  });
});

describe("many random real bills: the sum is always the total", () => {
  it("2000 random orders x modes x steps", () => {
    const r = rng(20261125);
    const steps = [0.01, 0.5, 1];
    for (let i = 0; i < 2000; i++) {
      const nLines = 1 + Math.floor(r() * 8);
      const lines = Array.from({ length: nLines }, () => 50 + Math.floor(r() * 30_000));
      const step = steps[Math.floor(r() * steps.length)];
      const settings: Partial<BillSettingsRow> = {
        rounding_step: step,
        currency: step === 1 ? "PKR" : "GBP",
        tax_rate_percent: [0, 5, 16, 20][Math.floor(r() * 4)],
        service_charge_percent: [0, 10, 12.5][Math.floor(r() * 3)],
        service_charge_applies_to: "all",
      };
      const discount = r() < 0.5 ? { type: "percent" as const, value: [5, 10, 33.33][Math.floor(r() * 3)] } : undefined;
      const kind: OrderKind = r() < 0.2 ? "delivery" : "dine_in";
      const order = orderOf(lines, { settings, discount, kind });
      const n = 2 + Math.floor(r() * 6);
      const modeRoll = r();
      let spec: SplitSpec;
      if (modeRoll < 0.4) {
        spec = { mode: "equal", guests: n };
      } else if (modeRoll < 0.8) {
        // Guest k gets line k first (so nobody is empty), the rest randomly shared.
        const assign: Record<string, number[]> = {};
        order.lines.forEach((l, k) => {
          const who = new Set<number>([(k % n) + 1]);
          if (r() < 0.4) who.add(1 + Math.floor(r() * n));
          assign[l.id] = [...who].sort((a, b) => a - b);
        });
        const covered = new Set(Object.values(assign).flat());
        if (covered.size < n) spec = { mode: "equal", guests: n };
        else spec = { mode: "items", guests: n, assign };
      } else {
        const units = order.totalPence / (order.totalPence % Math.round(step * 100) === 0 ? Math.round(step * 100) : 1);
        if (units < n) continue;
        const parts = allocate(units, Array.from({ length: n }, () => 1 + Math.floor(r() * 9)));
        if (parts.some((p) => p === 0)) continue;
        spec = { mode: "amounts", amounts: parts.map((p) => (p * order.totalPence) / units) };
      }
      const res = computeSplit(order, spec);
      if (!res.ok) {
        // Only a genuinely too-small item list may fail (a guest would get 0).
        expect(["guest_without_items", "guest_share_zero"]).toContain(res.error);
        continue;
      }
      expectExact(order, res.guests, spec.mode === "amounts" ? spec.amounts.length : spec.guests);
      const sp = order.totalPence % order.stepPence === 0 ? order.stepPence : 1;
      for (const g of res.guests) expect(g.totalPence % sp).toBe(0);
      // No rounding on the order (step 0.01) -> no Rounding line on any guest's equal share.
      if (spec.mode === "equal" && sp === 1) for (const g of res.guests) expect(g.roundingPence).toBe(0);
      if (spec.mode === "equal") {
        const t = res.guests.map((g) => g.totalPence);
        expect(Math.max(...t) - Math.min(...t)).toBeLessThanOrEqual(sp);
      }
    }
  });
});

describe("split link (?split=)", () => {
  it("round-trips every mode", () => {
    const specs: SplitSpec[] = [
      { mode: "equal", guests: 3 },
      { mode: "items", guests: 2, assign: { [ID(1)]: [1, 2], [ID(2)]: [2] } },
      { mode: "amounts", amounts: [1234, 5678] },
    ];
    for (const s of specs) {
      const code = encodeSplit(s);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeSplit(code)).toEqual(s);
    }
  });
  it("bad or tampered links give null", () => {
    expect(decodeSplit(undefined)).toBeNull();
    expect(decodeSplit("")).toBeNull();
    expect(decodeSplit("!!!")).toBeNull();
    expect(decodeSplit(["a"])).toBeNull();
    expect(decodeSplit(encodeSplit({ mode: "equal", guests: 3 }).slice(0, -3))).toBeNull();
    expect(decodeSplit(btoa(JSON.stringify({ mode: "equal", guests: 99 })).replace(/=+$/, ""))).toBeNull();
  });
});

