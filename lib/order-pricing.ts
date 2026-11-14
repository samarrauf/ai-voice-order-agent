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
