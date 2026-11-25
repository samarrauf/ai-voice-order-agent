// Cost and profit (B2). OWNER ONLY: callers must check can(role, "view_profit") /
// "view_cost" (lib/permissions.ts) BEFORE they load or return anything from here.
// Pure module (no server imports): unit-testable without the network.
//
// THE PROFIT RULE (the only place it is written down):
//   item_profit  = (unit_price - unit_cost) x quantity
//   order_profit = subtotal - discount_amount - cost_total - refund (without its tax share, B4b)
//   Delivery fee, service charge, tax and rounding are NOT profit (they are passed on
//   or cover other costs), so they are left out. Cancelled orders are left out entirely.
//   The cost is the snapshot saved on the order when it was sold (order_items.unit_cost,
//   orders.cost_total; create_order_tx, migration 0025), so a later menu cost change
//   never changes the profit of an order already sold.
//
// All maths in whole pence (integers), like lib/order-pricing.ts.

import { refundSalesPence } from "@/lib/order-adjust";

const toPence = (v: number | string) => Math.round(Number(v) * 100);

// ---------------------------------------------------------------------------
// Per line

export type LineCost = {
  /** null = cost not set for this line. */
  unit_cost: number | null;
  line_cost: number | null;
  profit: number | null;
};

/** Cost and profit of one sold line. unitCost null -> "Cost not set". */
export function lineProfit(unitPrice: number | string, unitCost: number | string | null | undefined, quantity: number): LineCost {
  if (unitCost === null || unitCost === undefined) return { unit_cost: null, line_cost: null, profit: null };
  const costPence = toPence(unitCost);
  return {
    unit_cost: costPence / 100,
    line_cost: (costPence * quantity) / 100,
    profit: ((toPence(unitPrice) - costPence) * quantity) / 100,
  };
}

/** Profit of one order (rule above). null when the order has no cost snapshot at all. */
export function orderProfit(o: {
  subtotal: number | string;
  discount_amount: number | string | null;
  cost_total: number | string | null;
  total?: number | string;
  tax_amount?: number | string | null;
  refunded_amount?: number | string | null;
}): number | null {
  if (o.cost_total === null || o.cost_total === undefined) return null;
  const refund = o.total === undefined ? 0 : refundSalesPence({ total: o.total, tax_amount: o.tax_amount ?? 0, refunded_amount: o.refunded_amount });
  return (toPence(o.subtotal) - toPence(o.discount_amount ?? 0) - toPence(o.cost_total) - refund) / 100;
}

// ---------------------------------------------------------------------------
// The cost of one unit, for the POS preview. MUST match order_line_unit_cost()
// in migration 0025 (the saved order uses that one; a test compares the two):
//   (cost of the chosen size, or of the item when there is no size) + cost of every extra.
//   Any part unknown -> null.

export type CostMaps = {
  item: Map<string, number>; // menu_item_id -> cost
  size: Map<string, number>; // `${menu_item_id}|${size name}` -> cost
  option: Map<string, number>; // item_option id -> cost
};

export const sizeKey = (menuItemId: string, sizeName: string) => `${menuItemId}|${sizeName}`;

export function unitCostFor(line: { menuItemId: string; sizeName: string | null; optionIds: readonly string[] }, costs: CostMaps): number | null {
  const base = line.sizeName !== null ? costs.size.get(sizeKey(line.menuItemId, line.sizeName)) : costs.item.get(line.menuItemId);
  if (base === undefined) return null;
  let pence = toPence(base);
  for (const id of line.optionIds) {
    const c = costs.option.get(id);
    if (c === undefined) return null;
    pence += toPence(c);
  }
  return pence / 100;
}

// ---------------------------------------------------------------------------
// Period summary (Expenses page, Home "Net profit" card)

export type ProfitOrder = {
  status: string;
  subtotal: number | string;
  discount_amount: number | string | null;
  tax_amount: number | string | null;
  total: number | string;
  /** Sum of refunds (B4b). Missing = 0. */
  refunded_amount?: number | string | null;
  cost_total: number | string | null;
  cost_complete: boolean | null;
};

export type ProfitSummary = {
  /** Sales without tax: total - tax (same as the Home dashboard, lib/dashboard-stats.ts). */
  sales: number;
  /** Cost of the items sold (the saved snapshots; unknown lines count as 0). */
  itemCost: number;
  /** Sum of order_profit (subtotal - discount - cost_total). */
  grossProfit: number;
  /** Expenses not voided. */
  expenses: number;
  netProfit: number;
  orders: number;
  /** Orders (not cancelled) where the cost of at least one line is not known. */
  incompleteOrders: number;
};

export function summarizeProfit(orders: readonly ProfitOrder[], expenseAmounts: readonly (number | string)[]): ProfitSummary {
  let sales = 0;
  let cost = 0;
  let gross = 0;
  let count = 0;
  let incomplete = 0;
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "merged") continue;
    count++;
    const c = toPence(o.cost_total ?? 0);
    // A refund is money given back: it comes off sales and profit (tax share taken out).
    const refund = refundSalesPence(o);
    sales += toPence(o.total) - toPence(o.tax_amount ?? 0) - refund;
    cost += c;
    gross += toPence(o.subtotal) - toPence(o.discount_amount ?? 0) - c - refund;
    if (!o.cost_complete) incomplete++;
  }
  const expenses = expenseAmounts.reduce<number>((sum, a) => sum + toPence(a), 0);
  return {
    sales: sales / 100,
    itemCost: cost / 100,
    grossProfit: gross / 100,
    expenses: expenses / 100,
    netProfit: (gross - expenses) / 100,
    orders: count,
    incompleteOrders: incomplete,
  };
}

/** Field names that must never reach a non-owner (the leak tests search every response for these). */
export const COST_FIELD_PATTERN = /cost|profit/i;
