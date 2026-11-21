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
  toOrderItemsPayload,
  type BillSettingsRow,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";
import { addressWithArea, type DeliveryAreaRow } from "@/lib/delivery";
import { activeDeliveryAreas, staffDeliveryCheck } from "@/lib/staff-delivery";

// Staff action: an order typed in by staff (the POS screen). Three kinds:
//   - dine_in (the default): added to a seated table. table_session_id is
//     required and the session must still be open.
//   - takeaway: a walk-in customer taking food away. No table needed.
//   - delivery: needs the customer name, phone and address. Stored as a
//     delivery order; the delivery fee comes from the restaurant settings.
//
// THE MONEY RULE still applies: staff send only item ids, sizes, options and
// quantities. Every price is calculated by the same shared pricing code the
// phone-order tool uses (lib/order-pricing.ts), from the menu tables. zod strips
// any "price"/"total" keys. The discount, delivery fee, service charge, tax and
// total are all worked out here by computeBill (lib/order-pricing.ts); a discount
// is only a type + value + reason, and is rejected if it breaks the restaurant's
// limits. A dine-in order's source is copied from the table session.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const bodySchema = z
  .object({
    // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
    restaurant_id: z.guid().optional(),
    order_type: z.enum(["dine_in", "takeaway", "delivery"]).default("dine_in"),
    table_session_id: z.guid().nullish(),
    customer_name: optionalText(80),
    customer_phone: optionalText(30),
    delivery_address: optionalText(200),
    delivery_postcode: optionalText(12),
    // area_list restaurants (migration 0022): the area chosen on the POS.
    delivery_area: optionalText(80),
    notes: optionalText(300),
    discount: discountSchema.nullish(),
    items: z.array(itemSchema).min(1).max(30),
  })
  .refine((b) => b.order_type !== "dine_in" || !!b.table_session_id, {
    path: ["table_session_id"],
    message: "is required for a dine-in order",
  })
  .refine((b) => b.order_type !== "delivery" || !!b.customer_name, {
    path: ["customer_name"],
    message: "is required for a delivery order",
  })
  .refine((b) => b.order_type !== "delivery" || !!b.customer_phone, {
    path: ["customer_phone"],
    message: "is required for a delivery order",
  })
  // The driver has to be able to ring this number: at least 7 digits.
  .refine((b) => b.order_type !== "delivery" || (b.customer_phone ?? "").replace(/\D/g, "").length >= 7, {
    path: ["customer_phone"],
    message: "must be a real phone number (at least 7 digits)",
  })
  .refine((b) => b.order_type !== "delivery" || !!b.delivery_address, {
    path: ["delivery_address"],
    message: "is required for a delivery order",
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
  // Only a dine-in order belongs to a table, even if a session id was sent.
  const sessionId = body.order_type === "dine_in" ? body.table_session_id! : null;

  const isDelivery = body.order_type === "delivery";
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [sessionRes, itemsRes, optionsRes, settingsRes, areasRes] = await Promise.all([
    sessionId
      ? supabaseAdmin
          .from("table_sessions")
          .select("id, source, cleared_at")
          .eq("id", sessionId)
          .eq("restaurant_id", rid)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", rid).is("archived_at", null).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", rid),
    supabaseAdmin.from("restaurants").select(`${BILL_SETTINGS_SELECT}, delivery_mode`).eq("id", rid).maybeSingle(),
    isDelivery ? activeDeliveryAreas(rid) : Promise.resolve({ data: [] as DeliveryAreaRow[], error: null }),
  ]);
  if (sessionRes.error || itemsRes.error || optionsRes.error || settingsRes.error || areasRes.error) {
    console.error(
      "manual-order: lookup failed",
      sessionRes.error ?? itemsRes.error ?? optionsRes.error ?? settingsRes.error ?? areasRes.error,
    );
    return fail("database lookup failed", 500);
  }
  const session = sessionRes.data;
  if (sessionId) {
    if (!session) return fail("table session not found for this restaurant", 404);
    if (session.cleared_at) return fail("table is already cleared; seat the table first", 409);
  }

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const priced = priceLines(body.items, menuById, optionsRes.data as DbOption[]);
  if (!priced.ok) return fail(priced.error, 400);
  const { lines, subtotalPence } = priced;
  if (!settingsRes.data) return fail("restaurant not found", 404);
  // Where we deliver, and the fee, by the same rules as the phone agent (lib/delivery.ts).
  const staffDelivery = staffDeliveryCheck(
    isDelivery,
    settingsRes.data as BillSettingsRow & { delivery_mode?: string | null },
    body.delivery_area,
    (areasRes.data ?? []) as DeliveryAreaRow[],
  );
  if (!staffDelivery.ok) return fail(staffDelivery.error, 400);
  const billed = computeBill(subtotalPence, body.order_type, staffDelivery.settings, body.discount);
  if (!billed.ok) return fail(billed.error, 400);
  const { bill } = billed;
  const area = staffDelivery.area;

  // Dine-in and takeaway are stored as 'pickup' (the orders table only allows
  // delivery/pickup); `source` + `table_session_id` is what marks an order dine-in.
  const { data: order, error: rpcError } = await supabaseAdmin.rpc("create_order_tx", {
    p_order: {
      restaurant_id: rid,
      call_id: null,
      fulfilment_type: body.order_type === "delivery" ? "delivery" : "pickup",
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      // An area_list order keeps its area in the address line, as the phone agent does.
      delivery_address: isDelivery ? addressWithArea(body.delivery_address!, area) : null,
      delivery_postcode: body.order_type === "delivery" ? body.delivery_postcode : null,
      subtotal: pounds(bill.subtotalPence),
      delivery_fee: pounds(bill.deliveryPence),
      discount_type: bill.discount.type,
      discount_value: bill.discount.value,
      discount_amount: pounds(bill.discountPence),
      discount_reason: bill.discount.reason,
      service_charge_amount: pounds(bill.serviceChargePence),
      tax_amount: pounds(bill.taxPence),
      rounding_amount: pounds(bill.roundingPence),
      total: pounds(bill.totalPence),
      payment_method: null,
      requested_time: null,
      notes: body.notes,
      // A delivery order is one staff took over the phone ('staff_phone'); dine-in keeps
      // the table session's source, takeaway stays 'walk_in'.
      source: body.order_type === "delivery" ? "staff_phone" : session?.source === "booking" ? "table_booking" : "walk_in",
      // Saved in the same insert as the order (create_order_tx, migration 0009). Null for takeaway.
      table_session_id: session?.id ?? null,
    },
    p_items: toOrderItemsPayload(lines),
  });
  if (rpcError || !order) {
    console.error("manual-order: create_order_tx failed", rpcError);
    return fail("order insert failed", 500);
  }
  const saved = order as { id: string; order_number: string; source: string };

  return NextResponse.json(
    {
      success: true,
      order_id: saved.id,
      order_number: saved.order_number,
      order_type: body.order_type,
      source: saved.source,
      table_session_id: session?.id ?? null,
      delivery_area: area?.label ?? null,
      ...billForResponse(bill),
    },
    { status: 201 },
  );
}
