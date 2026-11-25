import { describe, expect, it } from "vitest";
import { buildKot, type PrintInput } from "@/lib/receipt";
import { printKotAdditionHref, printKotHref } from "@/lib/print-links";

// The ADDITION kitchen ticket. No database, but lib/receipt imports branding, which needs the env keys (so not a *.pure test).

describe("ADDITION kitchen ticket", () => {
  const input = (): PrintInput => ({
    restaurant: { name: "T", currency: "GBP", timezone: "Europe/London" } as PrintInput["restaurant"],
    order: {
      order_number: "A-9", created_at: "2026-11-03T14:05:00Z", fulfilment_type: "pickup", source: "walk_in", table_session_id: "s",
      table_number: "T2", notes: "Allergy: nuts", subtotal: "30", discount_type: "none", discount_value: 0, discount_amount: 0,
      delivery_fee: 0, service_charge_amount: 0, tax_amount: 0, total: "30", payment_status: "unpaid", paid_amount: 0,
    } as PrintInput["order"],
    items: [
      { id: "i1", item_name: "Pizza", quantity: 1, line_total: "10" },
      { id: "i2", item_name: "Cola", quantity: 2, line_total: "6", size_name: "Large" },
      { id: "i3", item_name: "Chips", quantity: 1, line_total: "3.5", notes: "no salt" },
    ],
    payments: [],
  });

  it("lists only the new items and is marked addition; the old items are not printed again", () => {
    const k = buildKot(input(), ["i2", "i3"]);
    expect(k.addition).toBe(true);
    expect(k.lines.map((l) => l.name)).toEqual(["Cola", "Chips"]);
    expect(k.lines[0].options).toEqual(["Large"]);
    expect(k.notes).toBeNull(); // the order note was already sent with the first ticket
    expect(k.table).toBe("T2");
  });
  it("an id that is not on the order prints nothing; no ids = the normal full ticket", () => {
    expect(buildKot(input(), ["nope"]).lines).toEqual([]);
    const full = buildKot(input());
    expect(full.addition).toBeUndefined();
    expect(full.lines).toHaveLength(3);
    expect(full.notes).toBe("Allergy: nuts");
  });
  it("has no price or cost field", () => {
    expect(JSON.stringify(buildKot(input(), ["i1"]))).not.toMatch(/price|total|cost|profit/i);
  });
  it("links to the addition ticket by the event id", () => {
    expect(printKotAdditionHref("o1", "e 1")).toBe(`${printKotHref("o1")}?addition=e%201`);
  });
});

