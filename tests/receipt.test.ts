import { describe, expect, it } from "vitest";
import { buildKot, buildReceipt, orderKind, optionNames, type PrintInput } from "@/lib/receipt";

// Pure tests: no database. Figures on the receipt must be the SAVED ones.

const base = (): PrintInput => ({
  restaurant: {
    name: "Napoli Pizza & Grill",
    tagline: "Authentic Italian",
    address_line: "12 High St",
    city: "Manchester",
    postcode: "M1 1AA",
    phone: "0161 000 0000",
    currency: "GBP",
    timezone: "Europe/London",
  },
  order: {
    order_number: "A-1042",
    created_at: "2026-11-03T14:05:00Z",
    fulfilment_type: "pickup",
    source: "walk_in",
    table_session_id: "sess-1",
    table_number: "7",
    customer_name: "Sam",
    customer_phone: "07000000000",
    delivery_address: null,
    delivery_postcode: null,
    notes: "Allergy: nuts",
    subtotal: "20.00",
    discount_type: "percent",
    discount_value: 10,
    discount_amount: "2.00",
    delivery_fee: 0,
    service_charge_amount: "1.80",
    tax_amount: "0.00",
    total: "19.80",
    payment_status: "partial",
    paid_amount: "10.00",
  },
  items: [
    {
      item_name: "Margherita",
      size_name: "12 inch",
      options: [{ id: "x", group: "Extras", name: "Extra cheese", price_delta: 1 }],
      quantity: 2,
      line_total: "20.00",
      notes: "well done",
    },
  ],
  payments: [{ method: "cash", amount: "10.00" }],
});

describe("buildReceipt", () => {
  it("uses the saved figures and shows only the optional rows that apply", () => {
    const r = buildReceipt(base());
    expect(r.rows.map((x) => [x.label, x.value])).toEqual([
      ["Subtotal", "£20.00"],
      ["Discount (10%)", "-£2.00"],
      ["Service charge", "£1.80"],
      ["TOTAL", "£19.80"],
    ]);
    expect(r.lines[0]).toMatchObject({ quantity: 2, name: "Margherita", detail: ["12 inch", "Extra cheese"], lineTotal: "£20.00" });
  });

  it("shows paid, balance due, payments and status", () => {
    const r = buildReceipt(base());
    expect(r.paid).toBe("£10.00");
    expect(r.balanceDue).toBe("£9.80");
    expect(r.payments).toEqual([{ label: "Cash", amount: "£10.00" }]);
    expect(r.paymentStatusLabel).toBe("Partial");
  });

  it("is dine-in with a table; no delivery block", () => {
    const r = buildReceipt(base());
    expect(r.kindLabel).toBe("Dine-in");
    expect(r.table).toBe("7");
    expect(r.delivery).toBeNull();
  });

  it("delivery: shows customer name, phone and address, and the delivery fee", () => {
    const p = base();
    Object.assign(p.order, {
      fulfilment_type: "delivery", source: "staff_phone", table_session_id: null, table_number: null,
      delivery_address: "5 Oak Rd", delivery_postcode: "M2 2BB", delivery_fee: "2.50",
    });
    const r = buildReceipt(p);
    expect(r.kindLabel).toBe("Delivery");
    expect(r.table).toBeNull();
    expect(r.delivery).toEqual({ name: "Sam", phone: "07000000000", address: "5 Oak Rd, M2 2BB" });
    expect(r.rows.some((x) => x.label === "Delivery" && x.value === "£2.50")).toBe(true);
  });

  it("skips empty restaurant lines instead of printing placeholders", () => {
    const p = base();
    Object.assign(p.restaurant, { tagline: "  ", address_line: null, city: "", postcode: null, phone: null });
    const r = buildReceipt(p);
    expect(r.tagline).toBeNull();
    expect(r.address).toBeNull();
    expect(r.phone).toBeNull();
  });

  it("paid in full: balance is zero, status Paid", () => {
    const p = base();
    Object.assign(p.order, { paid_amount: "19.80", payment_status: "paid" });
    const r = buildReceipt(p);
    expect(r.balanceDue).toBe("£0.00");
    expect(r.paymentStatusLabel).toBe("Paid");
  });

  it("uses the restaurant currency", () => {
    const p = base();
    p.restaurant.currency = "EUR";
    expect(buildReceipt(p).rows[0].value).toBe("€20.00");
  });
});

describe("buildKot", () => {
  it("has no prices, payments or customer details", () => {
    const p = base();
    Object.assign(p.order, { fulfilment_type: "delivery", delivery_address: "5 Oak Rd", table_session_id: null });
    const k = buildKot(p);
    const text = JSON.stringify(k);
    expect(text).not.toMatch(/£|20\.00|19\.80|Oak|Sam|0700/);
    expect(k.lines[0]).toEqual({ quantity: 2, name: "Margherita", options: ["12 inch", "Extra cheese"], notes: "well done" });
    expect(k.notes).toBe("Allergy: nuts");
  });

  it("shows order kind and table", () => {
    const k = buildKot(base());
    expect(k).toMatchObject({ orderNumber: "A-1042", kindLabel: "Dine-in", table: "7" });
  });
});

describe("helpers", () => {
  it("orderKind", () => {
    expect(orderKind({ fulfilment_type: "delivery", source: "phone" })).toBe("delivery");
    expect(orderKind({ fulfilment_type: "pickup", source: "walk_in", table_session_id: "s" })).toBe("dine_in");
    expect(orderKind({ fulfilment_type: "pickup", source: "walk_in" })).toBe("takeaway");
    expect(orderKind({ fulfilment_type: "pickup", source: "phone" })).toBe("pickup");
  });

  it("optionNames accepts objects, strings and junk", () => {
    expect(optionNames([{ name: "A" }, "B", null, { name: " " }, 3])).toEqual(["A", "B"]);
    expect(optionNames(null)).toEqual([]);
  });
});
