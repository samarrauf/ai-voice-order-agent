import { describe, expect, it } from "vitest";
import { compareQuotes, heldCartSchema, type HeldCart } from "@/lib/held-carts";
import { isExcludedStatus } from "@/lib/dashboard-stats";

const GUID = "11111111-1111-4111-8111-111111111111";
const cart: HeldCart = {
  orderType: "takeaway",
  table: null,
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryPostcode: "",
  deliveryArea: "",
  discountType: "none",
  discountValue: "",
  discountReason: "",
  note: "",
  lines: [
    { key: "a", menuItemId: GUID, name: "Pizza", sizeName: null, options: [], quantity: 1 },
    { key: "b", menuItemId: GUID, name: "Cola", sizeName: null, options: [], quantity: 2 },
  ],
};

describe("held cart schema", () => {
  it("strips price keys and rejects empty or oversized carts", () => {
    const ok = heldCartSchema.parse({ ...cart, lines: [{ ...cart.lines[0], unitPrice: 0.01 }], total: 1 });
    expect(JSON.stringify(ok)).not.toContain("unitPrice");
    expect(heldCartSchema.safeParse({ ...cart, lines: [] }).success).toBe(false);
    expect(heldCartSchema.safeParse({ ...cart, lines: [{ ...cart.lines[0], quantity: 21 }] }).success).toBe(false);
    expect(heldCartSchema.safeParse({ ...cart, lines: [{ ...cart.lines[0], menuItemId: "nope" }] }).success).toBe(false);
  });
});

describe("compareQuotes", () => {
  it("reports only lines whose unit price changed, by name", () => {
    const r = compareQuotes(cart, { unit_prices: [10, 2], total: 14 }, [0, 1], [10, 2.5], 15);
    expect(r.changes).toEqual([{ name: "Cola", old_unit_price: 2, new_unit_price: 2.5 }]);
    expect(r.totalChanged).toBe(true);
    expect([r.oldTotal, r.newTotal]).toEqual([14, 15]);
  });

  it("matches kept lines to the right held line when one was removed", () => {
    const r = compareQuotes(cart, { unit_prices: [10, 2], total: 14 }, [1], [3], 6);
    expect(r.changes).toEqual([{ name: "Cola", old_unit_price: 2, new_unit_price: 3 }]);
  });

  it("no difference when prices match; unknown quote or total never claims a change", () => {
    expect(compareQuotes(cart, { unit_prices: [10, 2], total: 14 }, [0, 1], [10, 2], 14)).toMatchObject({ changes: [], totalChanged: false });
    expect(compareQuotes(cart, null, [0, 1], [10, 2], 14)).toMatchObject({ changes: [], totalChanged: false, oldTotal: null });
    expect(compareQuotes(cart, { unit_prices: [10, 2], total: 14 }, [0, 1], [10, 2], null).totalChanged).toBe(false);
  });
});

describe("excluded statuses", () => {
  it("cancelled and merged never count as sales", () => {
    expect(isExcludedStatus("merged")).toBe(true);
    expect(isExcludedStatus("cancelled")).toBe(true);
    expect(isExcludedStatus("completed")).toBe(false);
    expect(isExcludedStatus("new")).toBe(false);
  });
});
