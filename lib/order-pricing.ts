import { z } from "zod";
import { numberToWords, sizeForSpeech } from "@/lib/speech";

// Shared order pricing. Used by the phone-order tool (/api/tools/create-order)
// and the staff manual-order route, so there is exactly ONE copy of the price
// maths. THE MONEY RULE: every price comes from the menu tables; nothing
// price-like from a request is ever read. All arithmetic is in whole pence.

export const MAX_QTY = 20;

export const itemSchema = z.object({
  menu_item_id: z.guid(),
  size_name: z.string().trim().max(50).nullish(),
  quantity: z.number().int().min(1).max(MAX_QTY),
  options: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  notes: z.string().trim().max(200).nullish(),
});

export type OrderItemInput = z.infer<typeof itemSchema>;

// The two menu queries both routes run (one for items, one for options).
export const MENU_ITEM_SELECT = "id, name, category_id, base_price, is_available, item_sizes ( name, price, is_default )";
export const OPTION_SELECT =
  "id, menu_item_id, category_id, group_name, name, price_delta, max_select, is_available";

export type DbSize = { name: string; price: number | string; is_default: boolean };
export type DbItem = {
  id: string;
  name: string;
  category_id: string | null;
  base_price: number | string;
  is_available: boolean;
  item_sizes: DbSize[];
};
export type DbOption = {
  id: string;
  menu_item_id: string | null;
  category_id: string | null;
  group_name: string;
  name: string;
  price_delta: number | string;
  max_select: number;
  is_available: boolean;
};

export const pence = (v: number | string) => Math.round(Number(v) * 100);
export const pounds = (p: number) => p / 100;

/** "12 inch", "12\"", "12", "Twelve Inch" all normalise to "12inch". */
function normSize(s: string): string {
  const words: Record<string, string> = { ten: "10", twelve: "12", fourteen: "14", sixteen: "16" };
  let n = s.toLowerCase().replace(/["”]/g, "inch");
  n = n.replace(/\b(ten|twelve|fourteen|sixteen)\b/g, (w) => words[w]);
  n = n.replace(/[^a-z0-9]/g, "").replace(/inches$/, "inch");
  return /^\d+$/.test(n) ? `${n}inch` : n;
}

/** "Extra Cheese", "extra cheese", "add cheese" all normalise to "cheese". */
function normOption(s: string): string {
  return s.toLowerCase().replace(/^(extra|add)\s+/, "").replace(/[^a-z0-9]/g, "");
}

export function optionForSpeech(o: DbOption): string {
  const name = o.name.toLowerCase();
  if (/topping/i.test(o.group_name) && !name.startsWith("extra")) return `extra ${name}`;
  if (/crust/i.test(o.group_name)) return `${name} crust`;
  return name;
}

export function joinForSpeech(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export type PricedLine = {
  item: DbItem;
  sizeName: string | null;
  chosen: DbOption[];
  quantity: number;
  notes: string | null;
  unitPence: number;
  linePence: number;
};

export type PricingResult =
  | { ok: true; lines: PricedLine[]; subtotalPence: number }
  | { ok: false; speech: string; error: string };

/**
 * Prices every requested line from the database rows passed in. Returns the
 * first problem as a spoken sentence + a technical error, or the priced lines.
 */
export function priceLines(
  requested: OrderItemInput[],
  menuById: Map<string, DbItem>,
  allOptions: DbOption[],
): PricingResult {
  const lines: PricedLine[] = [];
  for (const req of requested) {
    const item = menuById.get(req.menu_item_id);
    if (!item) {
      return {
        ok: false,
        speech: "Sorry, I couldn't find one of those items on our menu. Could you tell me that item again?",
        error: `menu_item_id ${req.menu_item_id} not found for this restaurant`,
      };
    }
    // Rule 3: name the unavailable item.
    if (!item.is_available) {
      return {
        ok: false,
        speech: `Sorry, the ${item.name} isn't available right now. Would you like something else instead?`,
        error: `item unavailable: ${item.name}`,
      };
    }

    // Size: must match one of the item's sizes; default size if none given.
    let sizeName: string | null = null;
    let unitPence = pence(item.base_price);
    if (item.item_sizes.length > 0) {
      const size = req.size_name
        ? item.item_sizes.find((s) => normSize(s.name) === normSize(req.size_name!))
        : item.item_sizes.find((s) => s.is_default);
      if (!size) {
        const choices = joinForSpeech(item.item_sizes.map((s) => sizeForSpeech(s.name)));
        return {
          ok: false,
          speech: `What size would you like the ${item.name}? We do ${choices}.`,
          error: `size "${req.size_name ?? ""}" not found for ${item.name}`,
        };
      }
      sizeName = size.name;
      unitPence = pence(size.price);
    }

    // Options: must apply to this item (item-level, its category, or restaurant-wide).
    const applicable = allOptions.filter(
      (o) =>
        o.menu_item_id === item.id ||
        (o.menu_item_id === null && o.category_id === item.category_id) ||
        (o.menu_item_id === null && o.category_id === null),
    );
    const chosen: DbOption[] = [];
    for (const raw of req.options) {
      const opt = applicable.find((o) => normOption(o.name) === normOption(raw));
      if (!opt) {
        return {
          ok: false,
          speech: `Sorry, we can't do ${raw.toLowerCase()} on the ${item.name}. Is it okay without?`,
          error: `option "${raw}" not valid for ${item.name}`,
        };
      }
      if (!opt.is_available) {
        return {
          ok: false,
          speech: `Sorry, ${opt.name.toLowerCase()} isn't available right now. Is the ${item.name} okay without it?`,
          error: `option unavailable: ${opt.name}`,
        };
      }
      chosen.push(opt);
    }
    // Respect max_select per option group (e.g. only one crust).
    const perGroup = new Map<string, number>();
    for (const o of chosen) perGroup.set(o.group_name, (perGroup.get(o.group_name) ?? 0) + 1);
    for (const [group, count] of perGroup) {
      const max = Math.min(...chosen.filter((o) => o.group_name === group).map((o) => o.max_select));
      if (count > max) {
        return {
          ok: false,
          speech: `Sorry, you can only choose ${numberToWords(max)} ${group.toLowerCase()} for the ${item.name}. Which would you like?`,
          error: `too many options in group ${group} for ${item.name}`,
        };
      }
    }

    unitPence += chosen.reduce((sum, o) => sum + pence(o.price_delta), 0);
    const linePence = unitPence * req.quantity;

    lines.push({
      item,
      sizeName,
      chosen,
      quantity: req.quantity,
      notes: req.notes ?? null,
      unitPence,
      linePence,
    });
  }

  return { ok: true, lines, subtotalPence: lines.reduce((sum, l) => sum + l.linePence, 0) };
}

/** The `p_items` payload for the create_order_tx database function. */
export function toOrderItemsPayload(lines: PricedLine[]) {
  return lines.map((l) => ({
    menu_item_id: l.item.id,
    item_name: l.item.name,
    size_name: l.sizeName,
    options: l.chosen.map((o) => ({ id: o.id, group: o.group_name, name: o.name, price_delta: Number(o.price_delta) })),
    quantity: l.quantity,
    unit_price: pounds(l.unitPence),
    line_total: pounds(l.linePence),
    notes: l.notes,
  }));
}

// ---------------------------------------------------------------------------
// The bill: charges on top of the food. ONE place, used by price-preview and
// manual-order, so the preview and the saved order always agree.
//
// ORDER OF OPERATIONS (everything in whole pence, rounding only via roundPence):
//   1. subtotal        = sum of the priced lines (from the menu tables)
//   2. discount        = percent of subtotal, or a fixed amount; never more than
//                        the subtotal and never more than max_discount_percent
//   3. discounted      = subtotal - discount
//   4. delivery fee    = restaurants.delivery_fee, delivery orders only
//   5. service charge  = service_charge_percent of `discounted` (food only, not
//                        delivery), if service_charge_applies_to allows this order type
//   6. tax             = tax_rate_percent of (discounted + delivery + service charge)
//   7. total           = discounted + delivery + service charge + tax
// Tax is ADDED on top of the prices. With tax_rate_percent = 0 (the default
// until the client confirms it) nothing is added.
// ---------------------------------------------------------------------------

export type OrderKind = "dine_in" | "takeaway" | "delivery";

export const discountSchema = z.object({
  type: z.enum(["none", "percent", "fixed"]).default("none"),
  // At most 2 decimals: the database stores 2, so 5.005 would be saved as 5.01 but priced as 5.00.
  value: z
    .number()
    .finite()
    .min(0)
    .max(100000)
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, { message: "must have at most 2 decimals" })
    .default(0),
  reason: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
});
export type DiscountInput = z.infer<typeof discountSchema>;

/** The restaurants columns the bill needs. */
export const BILL_SETTINGS_SELECT =
  "delivery_fee, tax_rate_percent, service_charge_percent, service_charge_applies_to, max_discount_percent";

export type BillSettingsRow = {
  delivery_fee: number | string | null;
  tax_rate_percent: number | string;
  service_charge_percent: number | string;
  service_charge_applies_to: string;
  max_discount_percent: number | string;
};

/** The ONE rounding rule: a pence amount is rounded half up to a whole penny. */
export const roundPence = (n: number) => Math.round(n);

/** `percent` of `basePence`, rounded once. Percent has at most 2 decimals, so it is held as basis points (1% = 100). */
export const percentOf = (basePence: number, percent: number) => roundPence((basePence * Math.round(percent * 100)) / 10000);

export type Bill = {
  subtotalPence: number;
  discountPence: number;
  deliveryPence: number;
  serviceChargePence: number;
  taxPence: number;
  totalPence: number;
  discount: { type: "none" | "percent" | "fixed"; value: number; reason: string | null };
};

export type BillResult = { ok: true; bill: Bill } | { ok: false; error: string };

export function computeBill(
  subtotalPence: number,
  kind: OrderKind,
  settings: BillSettingsRow,
  discountInput?: DiscountInput | null,
): BillResult {
  const d = discountInput ?? { type: "none" as const, value: 0, reason: null };

  // Defence in depth: the inputs are validated upstream, but a NaN or negative
  // number must never turn into a bill.
  if (!Number.isInteger(subtotalPence) || subtotalPence < 0) return { ok: false, error: "invalid order subtotal" };
  if (!Number.isFinite(d.value)) return { ok: false, error: "discount value is not a valid number" };
  const maxPercent = Number(settings.max_discount_percent);
  const taxPercent = Number(settings.tax_rate_percent);
  const servicePercent = Number(settings.service_charge_percent);
  if (![maxPercent, taxPercent, servicePercent].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
    return { ok: false, error: "restaurant bill settings are invalid" };
  }

  // 2. Discount
  let discountPence = 0;
  if (d.type === "percent") {
    if (d.value <= 0) return { ok: false, error: "discount value must be more than 0" };
    if (d.value > 100) return { ok: false, error: "discount cannot be more than 100%" };
    discountPence = percentOf(subtotalPence, d.value);
  } else if (d.type === "fixed") {
    if (d.value <= 0) return { ok: false, error: "discount value must be more than 0" };
    discountPence = pence(d.value);
  }
  if (discountPence > subtotalPence) return { ok: false, error: "discount cannot be more than the subtotal" };
  // The cap in pence is rounded DOWN, so rounding can never lift a discount above
  // it. A percent discount is also compared as a percent (10.01% can't slip under
  // a 10% cap); its pence are then clamped to the cap (10% of 10.05 is 100.5p -> 100p).
  const capPence = Math.floor((subtotalPence * Math.round(maxPercent * 100)) / 10000);
  if (d.type === "percent") {
    if (d.value > maxPercent) return { ok: false, error: `discount is more than the allowed maximum of ${maxPercent}%` };
    discountPence = Math.min(discountPence, capPence);
  } else if (discountPence > capPence) {
    return { ok: false, error: `discount is more than the allowed maximum of ${maxPercent}%` };
  }
  const discounted = subtotalPence - discountPence;

  // 4. Delivery fee, delivery orders only
  let deliveryPence = 0;
  if (kind === "delivery") {
    if (settings.delivery_fee === null) return { ok: false, error: "delivery_fee not configured" };
    deliveryPence = pence(settings.delivery_fee);
    if (!Number.isInteger(deliveryPence) || deliveryPence < 0) return { ok: false, error: "delivery_fee is invalid" };
  }

  // 5. Service charge, only where the restaurant's setting allows it
  const applies = settings.service_charge_applies_to;
  const serviceApplies = applies === "all" || (applies === "dine_in" && kind === "dine_in");
  const serviceChargePence = serviceApplies ? percentOf(discounted, servicePercent) : 0;

  // 6. Tax on everything charged so far
  const taxPence = percentOf(discounted + deliveryPence + serviceChargePence, taxPercent);

  return {
    ok: true,
    bill: {
      subtotalPence,
      discountPence,
      deliveryPence,
      serviceChargePence,
      taxPence,
      totalPence: discounted + deliveryPence + serviceChargePence + taxPence,
      discount: { type: d.type, value: d.type === "none" ? 0 : d.value, reason: d.type === "none" ? null : d.reason },
    },
  };
}

/** The bill in pounds, as sent back to the screen. */
export function billForResponse(b: Bill) {
  return {
    subtotal: pounds(b.subtotalPence),
    discount: pounds(b.discountPence),
    delivery_fee: pounds(b.deliveryPence),
    service_charge: pounds(b.serviceChargePence),
    tax: pounds(b.taxPence),
    total: pounds(b.totalPence),
  };
}
