import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  MENU_ITEM_SELECT,
  OPTION_SELECT,
  itemSchema,
  pounds,
  priceLines,
  toOrderItemsPayload,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";

// Staff action: add a dine-in order to a seated table.
//
// THE MONEY RULE still applies: staff send only item ids, sizes, options and
// quantities. Every price is calculated by the same shared pricing code the
// phone-order tool uses (lib/order-pricing.ts), from the menu tables. zod strips
// any "price"/"total" keys. The order's source is copied from the table session.

const bodySchema = z.object({
  restaurant_id: z.guid(),
  table_session_id: z.guid(),
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

  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [sessionRes, itemsRes, optionsRes] = await Promise.all([
    supabaseAdmin
      .from("table_sessions")
      .select("id, source, cleared_at")
      .eq("id", body.table_session_id)
      .eq("restaurant_id", body.restaurant_id)
      .maybeSingle(),
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", body.restaurant_id).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", body.restaurant_id),
  ]);
  if (sessionRes.error || itemsRes.error || optionsRes.error) {
    console.error("manual-order: lookup failed", sessionRes.error ?? itemsRes.error ?? optionsRes.error);
    return fail("database lookup failed", 500);
  }
  const session = sessionRes.data;
  if (!session) return fail("table session not found for this restaurant", 404);
  if (session.cleared_at) return fail("table is already cleared; seat the table first", 409);

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const priced = priceLines(body.items, menuById, optionsRes.data as DbOption[]);
  if (!priced.ok) return fail(priced.error, 400);
  const { lines, subtotalPence } = priced;

  // Dine-in orders are stored as 'pickup' (the orders table only allows
  // delivery/pickup); `source` + `table_session_id` is what marks them dine-in.
  const { data: order, error: rpcError } = await supabaseAdmin.rpc("create_order_tx", {
    p_order: {
      restaurant_id: body.restaurant_id,
      call_id: null,
      fulfilment_type: "pickup",
      customer_name: null,
      customer_phone: null,
      subtotal: pounds(subtotalPence),
      delivery_fee: 0,
      total: pounds(subtotalPence),
      payment_method: null,
      requested_time: null,
      notes: null,
      source: session.source === "booking" ? "table_booking" : "walk_in",
    },
    p_items: toOrderItemsPayload(lines),
  });
  if (rpcError || !order) {
    console.error("manual-order: create_order_tx failed", rpcError);
    return fail("order insert failed", 500);
  }
  const saved = order as { id: string; order_number: string; source: string };

  // create_order_tx doesn't take table_session_id, so link it right after. If
  // that fails, remove the order so there is never an unlinked dine-in order.
  const { error: linkError } = await supabaseAdmin
    .from("orders")
    .update({ table_session_id: session.id })
    .eq("id", saved.id);
  if (linkError) {
    console.error("manual-order: linking table session failed", linkError);
    await supabaseAdmin.from("orders").delete().eq("id", saved.id);
    return fail("order insert failed", 500);
  }

  return NextResponse.json(
    {
      success: true,
      order_number: saved.order_number,
      source: saved.source,
      table_session_id: session.id,
      subtotal: pounds(subtotalPence),
      total: pounds(subtotalPence),
    },
    { status: 201 },
  );
}
