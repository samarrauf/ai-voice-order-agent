import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  BILL_SETTINGS_SELECT,
  MENU_ITEM_SELECT,
  OPTION_SELECT,
  billForResponse,
  computeBill,
  discountSchema,
  itemSchema,
  pounds,
  priceLines,
  type BillSettingsRow,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";
import type { DeliveryAreaRow } from "@/lib/delivery";
import { activeDeliveryAreas, staffDeliveryCheck } from "@/lib/staff-delivery";

// Staff action: "what does this cart cost?" for the POS screen. Saves nothing.
//
// THE MONEY RULE: the POS never adds up prices in the browser. It sends only
// item ids, sizes, options and quantities, and shows whatever this route sends
// back. The maths is the same shared code the real order uses
// (lib/order-pricing.ts), so the preview and the saved order always agree.
// zod strips any "price"/"total" keys the browser might send. It returns the
// whole bill: subtotal, discount, delivery fee, service charge, tax and total.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_type: z.enum(["dine_in", "takeaway", "delivery"]).default("dine_in"),
  // area_list restaurants (migration 0022): the area chosen so far, for its fee_override.
  delivery_area: z.string().trim().max(80).nullish(),
  discount: discountSchema.nullish(),
  items: z.array(itemSchema).min(1).max(30),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  // Queries in parallel (no per-item lookups). Delivery areas only for a delivery.
  const isDelivery = body.order_type === "delivery";
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [itemsRes, optionsRes, settingsRes, areasRes] = await Promise.all([
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", rid).is("archived_at", null).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", rid),
    supabaseAdmin.from("restaurants").select(`${BILL_SETTINGS_SELECT}, delivery_mode`).eq("id", rid).maybeSingle(),
    isDelivery ? activeDeliveryAreas(rid) : Promise.resolve({ data: [] as DeliveryAreaRow[], error: null }),
  ]);
  if (itemsRes.error || optionsRes.error || settingsRes.error || areasRes.error) {
    console.error("price-preview: lookup failed", itemsRes.error ?? optionsRes.error ?? settingsRes.error ?? areasRes.error);
    return fail("database lookup failed", 500);
  }

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const priced = priceLines(body.items, menuById, optionsRes.data as DbOption[]);
  if (!priced.ok) return fail(priced.error, 400);
  if (!settingsRes.data) return fail("restaurant not found", 404);
  // Same delivery rules and fee as manual-order; an area not chosen yet is shown at the restaurant's fee.
  const staffDelivery = staffDeliveryCheck(
    isDelivery,
    settingsRes.data as BillSettingsRow & { delivery_mode?: string | null },
    body.delivery_area,
    (areasRes.data ?? []) as DeliveryAreaRow[],
    true,
  );
  if (!staffDelivery.ok) return fail(staffDelivery.error, 400);
  const billed = computeBill(priced.subtotalPence, body.order_type, staffDelivery.settings, body.discount);
  if (!billed.ok) return fail(billed.error, 400);

  // Lines come back in the same order they were sent.
  return NextResponse.json({
    success: true,
    lines: priced.lines.map((l) => ({
      menu_item_id: l.item.id,
      name: l.item.name,
      size_name: l.sizeName,
      options: l.chosen.map((o) => o.name),
      quantity: l.quantity,
      unit_price: pounds(l.unitPence),
      line_total: pounds(l.linePence),
    })),
    ...billForResponse(billed.bill),
  });
}
