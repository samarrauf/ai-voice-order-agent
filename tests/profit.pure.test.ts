import { describe, expect, it } from "vitest";
import { lineProfit, orderProfit, sizeKey, summarizeProfit, unitCostFor, type CostMaps, type ProfitOrder } from "@/lib/profit";
import { addDays, expenseActionSchema, expenseFilter, isDateKey, rangeForDates, rangeForHome } from "@/lib/expenses";
import { hasCostFields, itemSchema } from "@/lib/menu-admin";
import { navFor } from "@/lib/nav";
import { can } from "@/lib/permissions";

// B2 pure rules: profit maths, the preview's unit cost, the period summary, expense
// validation and dates, and who may see cost. No network.

describe("profit rule", () => {
  it("item profit = (unit price - unit cost) x quantity", () => {
    expect(lineProfit(10.6, 4.4, 2)).toEqual({ unit_cost: 4.4, line_cost: 8.8, profit: 12.4 });
    expect(lineProfit("2.35", "0.80", 3)).toEqual({ unit_cost: 0.8, line_cost: 2.4, profit: 4.65 });
    expect(lineProfit(1, 1.5, 2).profit).toBe(-1);
  });
  it("unknown cost -> all null (Cost not set)", () => {
    expect(lineProfit(5, null, 2)).toEqual({ unit_cost: null, line_cost: null, profit: null });
    expect(lineProfit(5, undefined, 2).profit).toBeNull();
  });
  it("order profit = subtotal - discount - cost_total; null without a snapshot", () => {
    expect(orderProfit({ subtotal: 28.25, discount_amount: 2.83, cost_total: 11.2 })).toBe(14.22);
    expect(orderProfit({ subtotal: "0.10", discount_amount: "0.00", cost_total: "0.30" })).toBe(-0.2);
    expect(orderProfit({ subtotal: 10, discount_amount: 0, cost_total: null })).toBeNull();
  });
});

describe("unit cost (must match order_line_unit_cost in migration 0025)", () => {
  const costs: CostMaps = {
    item: new Map([["chips", 0.8]]),
    size: new Map([[sizeKey("pizza", "12 inch"), 4]]),
    option: new Map([
      ["cheese", 0.4],
      ["olives", 0.25],
    ]),
  };
  it("size cost (or item cost) + every extra", () => {
    expect(unitCostFor({ menuItemId: "pizza", sizeName: "12 inch", optionIds: ["cheese", "olives"] }, costs)).toBe(4.65);
    expect(unitCostFor({ menuItemId: "chips", sizeName: null, optionIds: [] }, costs)).toBe(0.8);
  });
  it("a size without its own cost does NOT fall back to the item cost", () => {
    expect(unitCostFor({ menuItemId: "pizza", sizeName: "10 inch", optionIds: [] }, costs)).toBeNull();
  });
  it("any extra without a cost -> unknown", () => {
    expect(unitCostFor({ menuItemId: "chips", sizeName: null, optionIds: ["cheese", "chilli"] }, costs)).toBeNull();
  });
});

describe("period summary", () => {
  const o = (over: Partial<ProfitOrder>): ProfitOrder => ({
    status: "completed",
    subtotal: 20,
    discount_amount: 0,
    tax_amount: 2,
    total: 24.5, // 20 + 2.50 delivery + 2 tax
    cost_total: 8,
    cost_complete: true,
    ...over,
  });
  it("sales without tax, gross profit without delivery/tax, expenses, net", () => {
    const s = summarizeProfit([o({}), o({ discount_amount: 5, total: 19.5, cost_total: 3, cost_complete: false })], [10, "2.50"]);
    expect(s).toEqual({ sales: 40, itemCost: 11, grossProfit: 24, expenses: 12.5, netProfit: 11.5, orders: 2, incompleteOrders: 1 });
  });
  it("cancelled orders are left out completely", () => {
    expect(summarizeProfit([o({ status: "cancelled" })], [])).toEqual({ sales: 0, itemCost: 0, grossProfit: 0, expenses: 0, netProfit: 0, orders: 0, incompleteOrders: 0 });
  });
  it("an old order without a snapshot counts as incomplete with cost 0", () => {
    const s = summarizeProfit([o({ cost_total: null, cost_complete: false })], []);
    expect([s.itemCost, s.grossProfit, s.incompleteOrders]).toEqual([0, 20, 1]);
  });
});

describe("expenses: validation and dates", () => {
  const schema = expenseActionSchema("PKR");
  const add = { action: "add", expense_date: "2026-11-20", category_id: "11111111-1111-1111-1111-111111111111", amount: 1250, paid_from: "drawer_cash" };
  it("a valid expense passes; bad amount, date, paid_from or extra keys do not", () => {
    expect(schema.safeParse(add).success).toBe(true);
    for (const bad of [{ amount: 0 }, { amount: -1 }, { amount: 1.005 }, { expense_date: "2026-02-30" }, { expense_date: "20-11-2026" }, { paid_from: "card" }, { cost: 1 }]) {
      expect(schema.safeParse({ ...add, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(schema.safeParse({ action: "void", id: add.category_id, reason: "  " }).success).toBe(false);
  });
  it("dates", () => {
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    const r = rangeForDates("2026-11-01", "2026-11-30", "Europe/London");
    expect([r.from.toISOString(), r.to.toISOString(), r.toDateExclusive]).toEqual(["2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z", "2026-12-01"]);
    const k = rangeForDates("2026-06-01", "2026-06-01", "Asia/Karachi");
    expect(k.from.toISOString()).toBe("2026-05-31T19:00:00.000Z");
  });
  it("the filter defaults to this month and swaps a reversed range", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    expect(expenseFilter({}, now, "Europe/London")).toEqual({ from: "2026-11-01", to: "2026-11-21", category: null });
    expect(expenseFilter({ from: "2026-11-10", to: "2026-11-02", category: "nope" }, now, "Europe/London")).toEqual({ from: "2026-11-02", to: "2026-11-10", category: null });
  });
  it("Home ranges: today, last 7 days, this month (expenses up to and including today)", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    expect(rangeForHome("today", now, "Europe/London")).toMatchObject({ fromDate: "2026-11-21", toDateExclusive: "2026-11-22", to: now });
    expect(rangeForHome("7d", now, "Europe/London").fromDate).toBe("2026-11-15");
    expect(rangeForHome("month", now, "Europe/London").fromDate).toBe("2026-11-01");
  });
});

describe("who sees cost", () => {
  it("view_cost, view_profit and manage_expenses are the owner's only", () => {
    for (const cap of ["view_cost", "view_profit", "manage_expenses"] as const) {
      expect([can("owner", cap), can("manager", cap), can("staff", cap)]).toEqual([true, false, false]);
    }
  });
  it("the Expenses nav item is shown to the owner only", () => {
    expect(navFor("owner").some((i) => i.id === "expenses")).toBe(true);
    expect(navFor("manager").some((i) => i.id === "expenses")).toBe(false);
    expect(navFor("staff").some((i) => i.id === "expenses")).toBe(false);
  });
  it("menu item cost fields are optional; hasCostFields spots any of them", () => {
    const s = itemSchema("PKR");
    const base = { category_id: "11111111-1111-1111-1111-111111111111", name: "Karahi", base_price: 1200 };
    const plain = s.parse(base);
    expect(hasCostFields(plain)).toBe(false);
    expect(hasCostFields(s.parse({ ...base, cost_price: null }))).toBe(true);
    expect(hasCostFields(s.parse({ ...base, sizes: [{ name: "Half", price: 700, is_default: true, cost_price: 300 }] }))).toBe(true);
    expect(hasCostFields(s.parse({ ...base, options: [{ group_name: "Add", name: "Naan", price_delta: 50, cost_price: 20 }] }))).toBe(true);
    expect(s.safeParse({ ...base, cost_price: -1 }).success).toBe(false);
  });
});
