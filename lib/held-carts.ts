import { z } from "zod";

// Held POS carts (B4a). A held cart is the POS cart state (ids, sizes, options,
// quantities: never prices) plus the quote the server worked out when it was
// held. On resume the server prices the cart again and `compareQuotes` says
// what changed. Pure module: no server imports.

const text = (max: number) => z.string().max(max);

export const heldCartSchema = z.object({
  orderType: z.enum(["dine_in", "takeaway", "delivery"]),
  table: z.object({ tableId: z.guid(), tableNumber: text(20), sessionId: z.guid() }).nullable(),
  customerName: text(80),
  customerPhone: text(30),
  deliveryAddress: text(200),
  deliveryPostcode: text(12),
  deliveryArea: text(80),
  discountType: z.enum(["none", "percent", "fixed"]),
  discountValue: text(20),
  discountReason: text(200),
  note: text(300),
  lines: z
    .array(
      z.object({
        key: text(400),
        menuItemId: z.guid(),
        name: text(120),
        sizeName: text(50).nullable(),
        options: z.array(text(60)).max(20),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
});
export type HeldCart = z.infer<typeof heldCartSchema>;

/** What was priced when the cart was held: one unit price per line (same order as the cart lines) and the total. */
export type HeldQuote = { unit_prices: number[]; total: number };

/** The jsonb stored in held_carts.cart. */
export type HeldCartRecord = { version: 1; cart: HeldCart; quote: HeldQuote | null };

export const holdBodySchema = z.object({
  action: z.literal("hold"),
  label: z.string().trim().min(1, "give the held order a name").max(60),
  cart: heldCartSchema,
});

export const heldIdBodySchema = z.object({ action: z.enum(["resume", "delete"]), id: z.guid() });
export const heldListBodySchema = z.object({ action: z.literal("list") });

export type PriceChange = { name: string; old_unit_price: number; new_unit_price: number };

/**
 * Compare the held quote with today's prices. `current` is one unit price per KEPT line,
 * `keptIndexes` says which held line each one belongs to (removed lines are skipped).
 */
export function compareQuotes(
  cart: HeldCart,
  held: HeldQuote | null,
  keptIndexes: number[],
  currentUnitPrices: number[],
  currentTotal: number | null,
): { changes: PriceChange[]; oldTotal: number | null; newTotal: number | null; totalChanged: boolean } {
  const changes: PriceChange[] = [];
  if (held) {
    keptIndexes.forEach((lineIndex, i) => {
      const was = held.unit_prices[lineIndex];
      const now = currentUnitPrices[i];
      if (was !== undefined && now !== undefined && Math.round(was * 100) !== Math.round(now * 100)) {
        changes.push({ name: cart.lines[lineIndex].name, old_unit_price: was, new_unit_price: now });
      }
    });
  }
  const oldTotal = held ? held.total : null;
  const totalChanged = oldTotal !== null && currentTotal !== null && Math.round(oldTotal * 100) !== Math.round(currentTotal * 100);
  return { changes, oldTotal, newTotal: currentTotal, totalChanged };
}
