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
  itemSchema,
  pence,
  pounds,
  priceLines,
  toOrderItemsPayload,
  type BillSettingsRow,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";

// Staff action: add more items to the RUNNING bill of a dine-in table (the guests keep
// ordering). Same capability as creating an order (any logged-in staff role).
//
// THE MONEY RULE: staff send only item ids, sizes, options and quantities. Prices come
// from the menu tables through the same priceLines() the order route uses; zod strips any
// "price"/"total" keys. Earlier items keep their saved (snapshot) prices: the new subtotal
// is the sum of the old items' saved line totals plus the new priced lines, and the whole
// bill is worked out again by computeBill (the order's own discount is kept). The cost
// snapshot of the new items is written by the database function (add_items_to_order_tx,
// migration 0028) exactly as create_order_tx does it; cost never appears in a response.
//
// The database function locks the order and refuses a cancelled, merged or completed
// order and an order that already has a payment. If another staff member added items
// between our read and the lock it answers "changed" and we read again.

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  order_id: z.guid(),
  items: z.array(itemSchema).min(1).max(30),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  order_not_found: ["order not found", 404],
  not_dine_in: ["items can only be added to a dine-in order on a table", 409],
  order_closed: ["this order is already closed, cancelled or merged, or the table was cleared: start a new order", 409],
  already_paid: ["a payment is already recorded on this order: create a new order", 409],
  bad_bill: ["could not work out the new bill", 500],
};

type OrderRow = {
  id: string;
  discount_type: string;
  discount_value: number | string;
  discount_reason: string | null;
  order_items: { line_total: number | string }[];
};

const MAX_ATTEMPTS = 6;

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

  // An order of another restaurant (or none) is a 404 before anything else is looked at.
  const exists = await supabaseAdmin.from("orders").select("id").eq("id", body.order_id).eq("restaurant_id", rid).maybeSingle();
  if (exists.error) {
    console.error("add-items: order lookup failed", exists.error);
    return fail("database lookup failed", 500);
  }
  if (!exists.data) return fail("order not found", 404);

  // Menu, options and bill settings are read once; they do not depend on the order.
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [itemsRes, optionsRes, settingsRes] = await Promise.all([
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", rid).is("archived_at", null).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", rid),
    supabaseAdmin.from("restaurants").select(BILL_SETTINGS_SELECT).eq("id", rid).maybeSingle(),
  ]);
  if (itemsRes.error || optionsRes.error || settingsRes.error) {
    console.error("add-items: lookup failed", itemsRes.error ?? optionsRes.error ?? settingsRes.error);
    return fail("database lookup failed", 500);
  }
  if (!settingsRes.data) return fail("restaurant not found", 404);
  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const priced = priceLines(body.items, menuById, optionsRes.data as DbOption[]);
  if (!priced.ok) return fail(priced.error, 400);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, discount_type, discount_value, discount_reason, order_items ( line_total )")
      .eq("id", body.order_id)
      .eq("restaurant_id", rid)
      .maybeSingle();
    if (orderRes.error) {
      console.error("add-items: order lookup failed", orderRes.error);
      return fail("database lookup failed", 500);
    }
    const order = orderRes.data as unknown as OrderRow | null;
    if (!order) return fail("order not found", 404);

    const oldPence = order.order_items.reduce((n, i) => n + pence(i.line_total), 0);
    const billed = computeBill(oldPence + priced.subtotalPence, "dine_in", settingsRes.data as unknown as BillSettingsRow, {
      type: order.discount_type as "none" | "percent" | "fixed",
      value: Number(order.discount_value),
      reason: order.discount_reason,
    });
    if (!billed.ok) return fail(`cannot add items: ${billed.error}`, 409);
    const b = billed.bill;

    const { data, error } = await supabaseAdmin.rpc("add_items_to_order_tx", {
      p_restaurant_id: rid,
      p_staff_id: auth.staff.staffId,
      p_order_id: body.order_id,
      p_items: toOrderItemsPayload(priced.lines),
      p_expected_subtotal: pounds(oldPence),
      p_bill: {
        subtotal: pounds(b.subtotalPence),
        discount_amount: pounds(b.discountPence),
        service_charge_amount: pounds(b.serviceChargePence),
        tax_amount: pounds(b.taxPence),
        rounding_amount: pounds(b.roundingPence),
        total: pounds(b.totalPence),
      },
    });
    if (error || !data) {
      console.error("add-items: add_items_to_order_tx failed", error);
      return fail("could not add the items", 500);
    }
    const result = data as {
      ok: boolean;
      error?: string;
      order_id?: string;
      event_id?: string;
      order_number?: string;
      item_ids?: string[];
      added_subtotal?: number;
      status?: string;
      status_before?: string;
    };
    if (result.ok) {
      return NextResponse.json(
        {
          success: true,
          order_id: result.order_id,
          order_number: result.order_number,
          item_ids: result.item_ids ?? [],
          event_id: result.event_id ?? null,
          added_subtotal: Number(result.added_subtotal),
          status: result.status,
          back_to_kitchen: result.status_before !== result.status,
          ...billForResponse(b),
        },
        { status: 201 },
      );
    }
    if (result.error === "changed") {
      // Someone else added items at the same moment: wait a moment, read the order again.
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 80)));
      continue;
    }
    const [message, status] = RPC_ERRORS[result.error ?? ""] ?? ["could not add the items", 500];
    return fail(message, status);
  }
  return fail("the order kept changing; try again", 409);
}
