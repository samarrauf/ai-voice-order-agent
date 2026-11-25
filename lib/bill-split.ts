import { z } from "zod";
import type { PrintInput } from "@/lib/receipt";

// B4c: splitting ONE order's bill between guests. PURE (no database, no network).
//
// THE RULE: the guests' shares always add up to EXACTLY the order total, and so
// does every part of the bill (subtotal, discount, delivery, service charge, tax,
// rounding). Nothing here re-prices the order: the parts are the ones saved on
// the order (computeBill made them), and they are only divided.
//
// How a share is made:
//   1. Each guest's subtotal = their items. A line given to several guests is
//      split equally in whole pence; the odd pence go to whoever has the least
//      so far, so an "equal" split stays as even as possible.
//      Weights: "items" = each guest's subtotal; "equal" = 1 each (so the totals
//      are equal to within one unit); "amounts" = the typed amounts (no items).
//   2. The guest's TOTAL = the order total divided by those weights with the
//      largest remainder method, in whole units of the restaurant's rounding step
//      (whole rupees with step 1), so every share is payable in cash.
//   3. Discount, delivery, service charge and tax are each divided by the same
//      weights (largest remainder, whole pence), so each one adds up exactly.
//   4. The guest's rounding = their total - (subtotal - discount + delivery +
//      service + tax). These add up to the order's rounding by construction.
// Every part is kept separately per guest, so a later stage (tax by payment
// method) can recompute one guest's tax without changing this module's shape.

export const MAX_GUESTS = 20;
const MAX_ASSIGNED_LINES = 300;
const MAX_SHARE_PENCE = 1_000_000_000;

const guestCount = z.number().int().min(2).max(MAX_GUESTS);

export const splitSpecSchema = z.discriminatedUnion("mode", [
  /** Everything divided equally between N guests. */
  z.object({ mode: z.literal("equal"), guests: guestCount }),
  /** Each order line (order_items.id) goes to one or more guests (1-based guest numbers). */
  z.object({
    mode: z.literal("items"),
    guests: guestCount,
    assign: z
      .record(z.guid(), z.array(z.number().int().min(1).max(MAX_GUESTS)).min(1).max(MAX_GUESTS))
      .refine((a) => Object.keys(a).length <= MAX_ASSIGNED_LINES, { message: "too many lines" }),
  }),
  /** Typed amounts in whole pence (minor units), one per guest. */
  z.object({
    mode: z.literal("amounts"),
    amounts: z.array(z.number().int().positive().max(MAX_SHARE_PENCE)).min(2).max(MAX_GUESTS),
  }),
]);
export type SplitSpec = z.infer<typeof splitSpecSchema>;

export const guestLabel = (guest: number) => `Guest ${guest}`;
export const guestsIn = (spec: SplitSpec) => (spec.mode === "amounts" ? spec.amounts.length : spec.guests);

/**
 * Largest remainder: `total` (whole units, >= 0) divided in proportion to `weights`
 * (whole, >= 0, at least one above 0). The parts always add up to `total` exactly;
 * a weight of 0 always gets 0. Equal remainders go to the higher `prefer` value
 * (if given), then the earlier position. BigInt, so large totals times large
 * weights never lose precision.
 */
export function allocate(total: number, weights: readonly number[], prefer?: readonly number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total) || total < 0 || !(sumW > 0) || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("allocate: invalid input");
  }
  const T = BigInt(total);
  const S = BigInt(sumW);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const rem = weights.map((w, i) => T * BigInt(w) - base[i] * S);
  const out = base.map(Number);
  const left = total - out.reduce((a, b) => a + b, 0);
  const pref = (i: number) => prefer?.[i] ?? 0;
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => (rem[b] > rem[a] ? 1 : rem[b] < rem[a] ? -1 : pref(b) - pref(a) || a - b));
  for (let k = 0; k < left; k++) out[order[k]] += 1;
  return out;
}

export type SplitLine = { id: string; name: string; quantity: number; detail: string[]; linePence: number };

/** One order's bill, in whole pence, as saved on the order. */
export type SplitOrder = {
  lines: SplitLine[];
  subtotalPence: number;
  discountPence: number;
  deliveryPence: number;
  servicePence: number;
  taxPence: number;
  roundingPence: number;
  totalPence: number;
  /** The restaurant's rounding step in pence (1 = no rounding, 100 = whole rupees). */
  stepPence: number;
};

/** A guest's part of one line. `sharedWith` = how many guests share the line (1 = the whole line). */
export type GuestPiece = { lineId: string; sharedWith: number; pence: number };

export type GuestShare = {
  guest: number;
  label: string;
  pieces: GuestPiece[];
  subtotalPence: number;
  discountPence: number;
  deliveryPence: number;
  servicePence: number;
  taxPence: number;
  roundingPence: number;
  totalPence: number;
};

export type SplitErrorCode =
  | "order_inconsistent"
  | "nothing_to_split"
  | "unknown_item"
  | "guest_out_of_range"
  | "duplicate_guest"
  | "item_not_assigned"
  | "guest_without_items"
  | "amounts_must_equal_total"
  | "amount_not_multiple_of_step"
  | "guest_share_zero";

export type SplitResult = { ok: true; guests: GuestShare[] } | { ok: false; error: SplitErrorCode; guest?: number };

/** Plain-English messages for the screen (the API sends these). */
export const SPLIT_ERRORS: Record<SplitErrorCode, string> = {
  order_inconsistent: "this order's saved bill does not add up; it cannot be split",
  nothing_to_split: "there is nothing to split on this order",
  unknown_item: "an item in the split is not on this order (the order may have changed; split again)",
  guest_out_of_range: "an item is given to a guest that is not in the split",
  duplicate_guest: "an item lists the same guest twice",
  item_not_assigned: "every item must be given to at least one guest",
  guest_without_items: "every guest needs at least one item",
  amounts_must_equal_total: "the amounts must add up to exactly the order total",
  amount_not_multiple_of_step: "each amount must be a multiple of the restaurant's rounding step",
  guest_share_zero: "every guest's share must be more than 0",
};

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Splits the order. Returns the shares (guest 1 first) or the first problem found. */
export function computeSplit(order: SplitOrder, spec: SplitSpec): SplitResult {
  const parts =
    order.subtotalPence - order.discountPence + order.deliveryPence + order.servicePence + order.taxPence + order.roundingPence;
  const money = [order.subtotalPence, order.discountPence, order.deliveryPence, order.servicePence, order.taxPence, order.totalPence];
  if (
    !money.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    !Number.isSafeInteger(order.roundingPence) ||
    parts !== order.totalPence ||
    sum(order.lines.map((l) => l.linePence)) !== order.subtotalPence ||
    order.lines.some((l) => !Number.isSafeInteger(l.linePence) || l.linePence < 0)
  ) {
    return { ok: false, error: "order_inconsistent" };
  }
  if (order.totalPence <= 0) return { ok: false, error: "nothing_to_split" };

  // An old order made before the restaurant changed its step may not be a multiple: then whole pence.
  const step = order.stepPence > 1 && order.totalPence % order.stepPence === 0 ? order.stepPence : 1;

  let n: number;
  let weights: number[];
  let totals: number[];
  let subtotals: number[];
  const pieces: GuestPiece[][] = [];

  if (spec.mode === "amounts") {
    n = spec.amounts.length;
    if (sum(spec.amounts) !== order.totalPence) return { ok: false, error: "amounts_must_equal_total" };
    const off = spec.amounts.findIndex((a) => a % step !== 0);
    if (off >= 0) return { ok: false, error: "amount_not_multiple_of_step", guest: off + 1 };
    weights = [...spec.amounts];
    totals = [...spec.amounts];
    subtotals = allocate(order.subtotalPence, weights);
    for (let g = 0; g < n; g++) pieces.push([]);
  } else {
    n = spec.guests;
    if (order.lines.length === 0 || order.subtotalPence <= 0) return { ok: false, error: "nothing_to_split" };
    const all = Array.from({ length: n }, (_, i) => i + 1);
    const lineIds = new Set(order.lines.map((l) => l.id));
    if (spec.mode === "items") {
      for (const [id, guests] of Object.entries(spec.assign)) {
        if (!lineIds.has(id)) return { ok: false, error: "unknown_item" };
        if (guests.some((g) => g > n)) return { ok: false, error: "guest_out_of_range" };
        if (new Set(guests).size !== guests.length) return { ok: false, error: "duplicate_guest" };
      }
    }
    subtotals = Array(n).fill(0);
    for (let g = 0; g < n; g++) pieces.push([]);
    for (const line of order.lines) {
      const who = spec.mode === "equal" ? all : spec.assign[line.id];
      if (!who) return { ok: false, error: "item_not_assigned" };
      const k = who.length;
      const base = Math.floor(line.linePence / k);
      let extra = line.linePence - base * k;
      // The odd pence go to the guests with the least so far (then the lower guest number).
      const byNeed = [...who].sort((a, b) => subtotals[a - 1] - subtotals[b - 1] || a - b);
      const got = new Map<number, number>(who.map((g) => [g, base]));
      for (const g of byNeed) {
        if (extra === 0) break;
        got.set(g, base + 1);
        extra--;
      }
      for (const g of [...who].sort((a, b) => a - b)) {
        const p = got.get(g)!;
        subtotals[g - 1] += p;
        pieces[g - 1].push({ lineId: line.id, sharedWith: k, pence: p });
      }
    }
    const empty = subtotals.findIndex((s) => s === 0);
    if (empty >= 0) return { ok: false, error: "guest_without_items", guest: empty + 1 };
    // Equal: every guest weighs the same, so the totals differ by at most one unit
    // (a penny, or a rupee with step 1). By items: weights = each guest's items.
    weights = spec.mode === "equal" ? Array(n).fill(1) : subtotals;
    totals = allocate(order.totalPence / step, weights).map((u) => u * step);
  }

  // Each part in turn. Where remainders tie (always so in an equal split), the odd
  // penny goes to the guest furthest from their total, so a guest's own Rounding
  // line stays 0 whenever it can.
  const running = [...subtotals];
  const part = (amount: number, sign: 1 | -1) => {
    const away = running.map((r, g) => sign * (totals[g] - r));
    const got = allocate(amount, weights, away);
    got.forEach((p, g) => (running[g] += sign * p));
    return got;
  };
  const discount = part(order.discountPence, -1);
  const delivery = part(order.deliveryPence, 1);
  const service = part(order.servicePence, 1);
  const tax = part(order.taxPence, 1);

  const guests: GuestShare[] = [];
  for (let g = 0; g < n; g++) {
    if (totals[g] <= 0) return { ok: false, error: "guest_share_zero", guest: g + 1 };
    const before = subtotals[g] - discount[g] + delivery[g] + service[g] + tax[g];
    guests.push({
      guest: g + 1,
      label: guestLabel(g + 1),
      pieces: pieces[g],
      subtotalPence: subtotals[g],
      discountPence: discount[g],
      deliveryPence: delivery[g],
      servicePence: service[g],
      taxPence: tax[g],
      roundingPence: totals[g] - before,
      totalPence: totals[g],
    });
  }
  return { ok: true, guests };
}

const toPence = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** The split view of an order loaded for printing. `roundingStep` is restaurants.rounding_step (0.01, 0.5, 1). */
export function splitOrderFromPrint(input: PrintInput, roundingStep: number | string | null | undefined): SplitOrder {
  const o = input.order;
  const step = Number(roundingStep ?? 0.01);
  return {
    lines: input.items
      .filter((i) => !i.voided_at && i.id)
      .map((i) => {
        const opts = Array.isArray(i.options)
          ? i.options
              .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x as { name?: unknown }).name : null))
              .filter((x): x is string => typeof x === "string" && !!x.trim())
          : [];
        return {
          id: i.id!,
          name: i.item_name,
          quantity: i.quantity,
          detail: [i.size_name?.trim() || null, ...opts].filter((x): x is string => !!x),
          linePence: toPence(i.line_total),
        };
      }),
    subtotalPence: toPence(o.subtotal),
    discountPence: toPence(o.discount_amount),
    deliveryPence: toPence(o.delivery_fee),
    servicePence: toPence(o.service_charge_amount),
    taxPence: toPence(o.tax_amount),
    roundingPence: toPence(o.rounding_amount),
    totalPence: toPence(o.total),
    stepPence: Number.isFinite(step) && step > 0 ? Math.round(step * 100) : 1,
  };
}

/** Money a guest has paid so far (payments saved with their label; refunds are not counted). */
export function paidByGuestPence(payments: PrintInput["payments"], label: string): number {
  return sum(payments.filter((p) => (p.kind ?? "payment") === "payment" && p.payer_label === label).map((p) => toPence(p.amount)));
}

// ---- The split in a link (print page): base64url of a small JSON. ----

/** Text for a ?split= link. Ascii-only JSON, so btoa is safe (browser and server). */
export function encodeSplit(spec: SplitSpec): string {
  return btoa(JSON.stringify(spec)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The split from a ?split= link, or null when it is missing, too long or not a valid split. */
export function decodeSplit(code: string | string[] | undefined | null): SplitSpec | null {
  if (typeof code !== "string" || code.length === 0 || code.length > 20_000 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    const parsed = splitSpecSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
