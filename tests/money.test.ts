import { describe, expect, it } from "vitest";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  formatMoney,
  maxAmountFor,
  maxDeliveryFeeFor,
  maxMinOrderFor,
  speechWordFor,
} from "@/lib/money";
import { discountSchema } from "@/lib/order-pricing";
import { parseSettings } from "@/lib/settings";

// P9a-A: the currency config and formatMoney. Pure tests, no database.

const intl = (code: string, n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(n);

describe("formatMoney", () => {
  it("GBP, EUR and USD look exactly as they did before", () => {
    expect(formatMoney(8.5)).toBe("£8.50");
    expect(formatMoney(8.5, "GBP")).toBe(intl("GBP", 8.5));
    expect(formatMoney(8.5, "EUR")).toBe(intl("EUR", 8.5));
    expect(formatMoney(8.5, "USD")).toBe(intl("USD", 8.5));
    expect(formatMoney(-2, "GBP")).toBe(intl("GBP", -2));
  });

  it("PKR: whole rupees have no decimals, with thousands commas", () => {
    expect(formatMoney(1250, "PKR")).toBe("Rs 1,250");
    expect(formatMoney(0, "PKR")).toBe("Rs 0");
    expect(formatMoney(1234567, "PKR")).toBe("Rs 1,234,567");
  });

  it("PKR: paisa are shown (two decimals) only when there are some", () => {
    expect(formatMoney(1250.5, "PKR")).toBe("Rs 1,250.50");
    expect(formatMoney(0.12, "PKR")).toBe("Rs 0.12");
  });

  it("PKR: negative amounts (a discount line) keep the sign in front", () => {
    expect(formatMoney(-50, "PKR")).toBe("-Rs 50");
    expect(formatMoney(-0.12, "PKR")).toBe("-Rs 0.12");
  });

  it("an unknown currency code never crashes: it falls back to the default", () => {
    expect(formatMoney(8.5, "NOT-A-CODE")).toBe(formatMoney(8.5, DEFAULT_CURRENCY));
  });
});

describe("currency config", () => {
  it("has GBP, EUR, USD and PKR with their symbol, spoken word and limits", () => {
    expect(Object.keys(CURRENCY_CONFIG).sort()).toEqual(["EUR", "GBP", "PKR", "USD"]);
    expect(speechWordFor("GBP")).toBe("pounds");
    expect(speechWordFor("EUR")).toBe("euros");
    expect(speechWordFor("USD")).toBe("dollars");
    expect(speechWordFor("PKR")).toBe("rupees");
    expect(CURRENCY_CONFIG.PKR.symbol).toBe("Rs");
    expect(CURRENCY_CONFIG.PKR.decimals).toBe(0);
    expect(CURRENCY_CONFIG.GBP.decimals).toBe(2);
  });

  it("GBP limits are exactly the old hard-coded ones (Napoli does not change)", () => {
    expect(maxAmountFor("GBP")).toBe(100000);
    expect(maxDeliveryFeeFor("GBP")).toBe(100);
    expect(maxMinOrderFor("GBP")).toBe(1000);
  });

  it("PKR limits are bigger than GBP, so rupee amounts are not refused", () => {
    expect(maxAmountFor("PKR")).toBeGreaterThan(maxAmountFor("GBP"));
    expect(maxDeliveryFeeFor("PKR")).toBeGreaterThanOrEqual(1000);
    expect(maxMinOrderFor("PKR")).toBeGreaterThanOrEqual(10000);
  });

  it("an unknown currency uses the default's limits and word", () => {
    expect(maxAmountFor("NOT-A-CODE")).toBe(maxAmountFor(DEFAULT_CURRENCY));
    expect(speechWordFor("NOT-A-CODE")).toBe(speechWordFor(DEFAULT_CURRENCY));
  });
});

describe("limits come from the currency, not from a number written in a schema", () => {
  const money = (over: Record<string, unknown> = {}) => ({
    delivery_fee: 150, min_order_value: 1500, tax_rate_percent: 0, service_charge_percent: 0,
    service_charge_applies_to: "none", max_discount_percent: 0, ...over,
  });

  it("settings: a rupee delivery fee of 150 and minimum order 1500 are accepted for PKR", () => {
    expect(parseSettings({ section: "money", values: money() }, "PKR").ok).toBe(true);
  });

  it("settings: the same figures are refused for GBP (the old 100 / 1000 limits)", () => {
    expect(parseSettings({ section: "money", values: money() }, "GBP").ok).toBe(false);
    expect(parseSettings({ section: "money", values: money() }).ok).toBe(false); // default currency is GBP
    expect(parseSettings({ section: "money", values: money({ delivery_fee: 100, min_order_value: 1000 }) }, "GBP").ok).toBe(true);
  });

  it("settings: rounding_step is read-only, like currency and timezone", () => {
    const r = parseSettings({ section: "money", values: money({ delivery_fee: 3, min_order_value: 10, rounding_step: 1 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/rounding_step: read-only/);
  });

  it("discount schema: its ceiling is the biggest currency limit, not a literal 100000", () => {
    const biggest = Math.max(...Object.keys(CURRENCY_CONFIG).map((c) => maxAmountFor(c)));
    expect(discountSchema.safeParse({ type: "fixed", value: biggest }).success).toBe(true);
    expect(discountSchema.safeParse({ type: "fixed", value: biggest + 1 }).success).toBe(false);
  });
});
