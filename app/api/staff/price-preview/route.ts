import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/staff-auth";
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

// Staff action: "what does this cart cost?" for the POS screen. Saves nothing.
//
// THE MONEY RULE: the POS never adds up prices in the browser. It sends only
// item ids, sizes, options and quantities, and shows whatever this route sends
// back. The maths is the same shared code the real order uses
// (lib/order-pricing.ts), so the preview and the saved order always agree.
// zod strips any "price"/"total" keys the browser might send. It returns the
// whole bill: subtotal, discount, delivery fee, service charge, tax and total.

const bodySchema = z.object({
  restaurant_id: z.guid(),
  order_type: z.enum(["dine_in", "takeaway", "delivery"]).default("dine_in"),
  discount: discountSchema.nullish(),
  items: z.array(itemSchema).min(1).max(30),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const denied = requireDashboardSession(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;

  // Two queries, in parallel (no per-item lookups).
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [itemsRes, optionsRes, settingsRes] = await Promise.all([
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", body.restaurant_id).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", body.restaurant_id),
    supabaseAdmin.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", body.restaurant_id).maybeSingle(),
  ]);
  if (itemsRes.error || optionsRes.error || settingsRes.error) {
    console.error("price-preview: lookup failed", itemsRes.error ?? optionsRes.error ?? settingsRes.error);
    return fail("database lookup failed", 500);
  }

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const priced = priceLines(body.items, menuById, optionsRes.data as DbOption[]);
  if (!priced.ok) return fail(priced.error, 400);
  if (!settingsRes.data) return fail("restaurant not found", 404);
  const billed = computeBill(priced.subtotalPence, body.order_type, settingsRes.data as BillSettingsRow, body.discount);
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
