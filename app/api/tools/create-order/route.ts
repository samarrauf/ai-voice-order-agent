import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  currencyFields,
  formatPostcode,
  moneyForSpeech,
  normalizePhone,
  numberToWords,
  phoneForSpeech,
  postcodeForSpeech,
  sizeForSpeech,
} from "@/lib/speech";
import {
  AREA_MISSING_SPEECH,
  AREA_NOT_LISTED_SPEECH,
  DELIVERY_AREA_SELECT,
  DELIVERY_ETA_MINUTES,
  FEE_MISSING_SPEECH,
  NO_DELIVERY_SPEECH,
  OUTSIDE_POSTCODE_SPEECH,
  PICKUP_ETA_MINUTES,
  addressWithArea,
  decideDelivery,
  deliveryModeOf,
  type DeliveryAreaRow,
} from "@/lib/delivery";
import { checkOpen, nextOpening, resolveRequestedTime, type OpeningHours } from "@/lib/opening-hours";
import { timed } from "@/lib/timing";
import {
  BILL_SETTINGS_SELECT,
  MAX_QTY,
  MENU_ITEM_SELECT,
  OPTION_SELECT,
  billForResponse,
  computeBill,
  itemSchema,
  joinForSpeech,
  kindForFulfilment,
  optionForSpeech,
  pence,
  pounds,
  priceLines,
  toOrderItemsPayload,
  type Bill,
  type BillSettingsRow,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";

// Voice-agent tool: place an order.
//
// THE MONEY RULE: every price, subtotal and total is calculated here from the
// menu tables. Anything price-like in the request body is never read — zod
// strips unknown keys like "total" and "subtotal" before we touch the data.
// All arithmetic is done in whole pence to avoid floating-point errors.
//
// THE BILL is made by computeBill (lib/order-pricing.ts), the same function the
// POS uses, so a phone order and a POS order for the same food always cost the
// same: delivery fee, service charge and tax all come from the restaurant's
// settings. The agent never gives a discount (discount is a staff decision).

/** ", including 2.50 delivery, 1.25 service charge and 2.10 tax". Zero service charge / tax are not mentioned. */
function chargesForSpeech(bill: Bill, isDelivery: boolean, currency: string): string {
  const say = (p: number) => moneyForSpeech(pounds(p), currency);
  const parts: string[] = [];
  if (isDelivery) parts.push(`${say(bill.deliveryPence)} delivery`);
  if (bill.serviceChargePence > 0) parts.push(`${say(bill.serviceChargePence)} service charge`);
  if (bill.taxPence > 0) parts.push(`${say(bill.taxPence)} tax`);
  if (bill.roundingPence > 0) parts.push(`${say(bill.roundingPence)} rounding`);
  if (bill.roundingPence < 0) parts.push(`${say(-bill.roundingPence)} taken off for rounding`);
  return parts.length ? `, including ${joinForSpeech(parts)}` : "";
}

const bodySchema = z.object({
  // preview: true = run every check and price the order, but save nothing.
  // The agent uses it to read back the exact total before the caller confirms.
  preview: z.boolean().default(false),
  restaurant_id: z.guid(),
  call_id: z.string().trim().max(100).nullish(),
  fulfilment_type: z.enum(["delivery", "pickup"]),
  customer_name: z.string().trim().min(1).max(100),
  customer_phone: z
    .string()
    .transform(normalizePhone)
    .refine((p) => p.replace("+", "").length >= 10 && p.length <= 16),
  delivery_address: z.string().trim().max(300).nullish(),
  delivery_postcode: z.string().trim().max(20).nullish(),
  // area_list restaurants (migration 0022): the area the caller named.
  delivery_area: z.string().trim().max(80).nullish(),
  payment_method: z.enum(["cash", "card_on_delivery"]),
  // Pre-orders: restaurant wall-clock time "HH:MM" (24h). The server resolves the
  // date itself (next occurrence), so the agent never does date/timezone maths.
  requested_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  notes: z.string().trim().max(500).nullish(),
  items: z.array(itemSchema).min(1).max(30),
});

type Body = z.infer<typeof bodySchema>;

/** 400 with a sentence the agent can read straight to the caller. */
function reject(speech: string, error: string, status = 400) {
  return NextResponse.json({ success: false, error, speech }, { status });
}

/** Turns a zod failure into something the caller can hear. Never technical. */
function validationSpeech(error: z.ZodError): string {
  const paths = error.issues.map((i) => i.path.join("."));
  if (paths.some((p) => p.endsWith("quantity"))) {
    return `Sorry, I can take between one and ${numberToWords(MAX_QTY)} of each item. How many would you like?`;
  }
  if (paths.includes("customer_name")) return "Sorry, could I take your name for the order?";
  if (paths.includes("customer_phone")) return "Sorry, could I take a contact phone number?";
  if (paths.includes("payment_method")) return "Will you be paying by cash or card on delivery?";
  if (paths.includes("fulfilment_type")) return "Is that for delivery or collection?";
  if (paths.some((p) => p.startsWith("items"))) {
    return "Sorry, I didn't quite get the order. Could you go through the items again?";
  }
  return "Sorry, something didn't come through properly. Could we go over the order again?";
}

export const POST = timed("create-order", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    return reject(validationSpeech(parsed.error), `invalid body: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  }
  const body: Body = parsed.data;
  const isDelivery = body.fulfilment_type === "delivery";

  // Four queries, in parallel — no N+1. (Delivery areas only for a delivery.)
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [restaurantRes, itemsRes, optionsRes, areasRes] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select(`is_accepting_orders, opening_hours, timezone, min_order_value, delivery_mode, ${BILL_SETTINGS_SELECT}`)
      .eq("id", body.restaurant_id)
      .maybeSingle(),
    supabaseAdmin
      .from("menu_items")
      .select(MENU_ITEM_SELECT)
      .eq("restaurant_id", body.restaurant_id)
      .in("id", itemIds),
    supabaseAdmin
      .from("item_options")
      .select(OPTION_SELECT)
      .eq("restaurant_id", body.restaurant_id),
    isDelivery
      ? supabaseAdmin
          .from("delivery_areas")
          .select(DELIVERY_AREA_SELECT)
          .eq("restaurant_id", body.restaurant_id)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as DeliveryAreaRow[], error: null }),
  ]);
  timer.lap("db");

  if (restaurantRes.error || itemsRes.error || optionsRes.error || areasRes.error) {
    console.error("create-order: lookup failed", restaurantRes.error ?? itemsRes.error ?? optionsRes.error ?? areasRes.error);
    return reject("Sorry, I'm having trouble placing that order. Could you hold on a moment?", "database lookup failed", 500);
  }
  const restaurant = restaurantRes.data;
  if (!restaurant) {
    return reject("Sorry, I'm having trouble placing that order. Could you hold on a moment?", "restaurant not found", 404);
  }
  const currency = currencyFields(restaurant.currency).currency;
  const mode = deliveryModeOf(restaurant.delivery_mode);

  // Delivery checks first, in the same order as before 0022 for postcode
  // restaurants: address, postcode, area. Rules shared with the POS (lib/delivery.ts).
  let delivery: Extract<ReturnType<typeof decideDelivery>, { ok: true }> | null = null;
  if (isDelivery) {
    if (mode === "none") return reject(NO_DELIVERY_SPEECH, "restaurant does not deliver");
    if (!body.delivery_address) {
      return reject("What's the address for delivery?", "delivery_address required for delivery");
    }
    if (mode === "postcode" && !body.delivery_postcode) {
      return reject("And what's the postcode for delivery?", "delivery_postcode required for delivery");
    }
    const decision = decideDelivery(
      mode,
      // An area_list caller's area may arrive in either field.
      { postcode: body.delivery_postcode, area: body.delivery_area ?? body.delivery_postcode },
      (areasRes.data ?? []) as DeliveryAreaRow[],
      restaurant.delivery_fee,
    );
    if (!decision.ok) {
      switch (decision.reason) {
        case "area_missing":
          return reject(AREA_MISSING_SPEECH, "delivery_area required for delivery");
        case "area_not_listed":
          return reject(AREA_NOT_LISTED_SPEECH, "area not in delivery area list");
        case "no_delivery":
          return reject(NO_DELIVERY_SPEECH, "no active delivery areas");
        default:
          return reject(OUTSIDE_POSTCODE_SPEECH, "postcode outside delivery area");
      }
    }
    delivery = decision;
  }

  // Rule 2: the owner's switch beats everything, whatever the time.
  if (!restaurant.is_accepting_orders) {
    return reject("Sorry, we're not taking any orders at the moment.", "restaurant not accepting orders");
  }

  // Rule 2b: open now, or a valid pre-order for when we're open.
  const tz = restaurant.timezone ?? "Europe/London";
  const hours = restaurant.opening_hours as OpeningHours | null;
  const now = new Date();
  const openCheck = checkOpen(hours, tz, now);
  const scheduled = body.requested_time ? resolveRequestedTime(body.requested_time, tz, now) : null;

  if (!openCheck.open) {
    const next = nextOpening(hours, tz, now);
    if (!next) {
      return reject(openCheck.speech, "restaurant closed, no upcoming opening hours");
    }
    if (!scheduled) {
      return reject(
        `We're closed at the moment, we open at ${next.spoken}. I can take your order for then if you like. What time would you like it?`,
        "restaurant closed: pre-order needs requested_time",
      );
    }
    if (scheduled.at.getTime() < next.at.getTime()) {
      return reject(
        `Sorry, we don't open until ${next.spoken}, so the earliest I can do is ${next.spoken}. Is that okay?`,
        `requested_time ${body.requested_time} is before next opening ${next.at.toISOString()}`,
      );
    }
  }
  // Any requested time (pre-order or later today) must fall inside opening hours.
  if (scheduled && !checkOpen(hours, tz, scheduled.at).open) {
    const next = nextOpening(hours, tz, now);
    return reject(
      next
        ? `Sorry, we're closed at that time. The earliest I can do is ${next.spoken}. What time would you like it?`
        : "Sorry, we're closed at that time. What time would you like it?",
      `requested_time ${body.requested_time} is outside opening hours`,
    );
  }

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const allOptions = optionsRes.data as DbOption[];

  // Price every line from the database (shared with the staff manual-order route).
  const priced = priceLines(body.items, menuById, allOptions);
  if (!priced.ok) return reject(priced.speech, priced.error);
  const { lines, subtotalPence } = priced;

  if (isDelivery) {
    // Rule 4: minimum order for delivery (on food, before the delivery fee).
    const minPence = restaurant.min_order_value === null ? 0 : pence(restaurant.min_order_value);
    if (subtotalPence < minPence) {
      const short = moneyForSpeech(pounds(minPence - subtotalPence), currency);
      return reject(
        `Sorry, the minimum for delivery is ${moneyForSpeech(pounds(minPence), currency)}. You need another ${short} to reach it. Would you like to add something, or collect instead?`,
        `below minimum order: short by ${short}`,
      );
    }
    // A missing fee is a configuration error, never free delivery.
    if (delivery!.fee === null) {
      console.error(`create-order: delivery_fee is null for ${body.restaurant_id}; refusing delivery order`);
      return reject(FEE_MISSING_SPEECH, "delivery_fee not configured", 500);
    }
  }

  // The whole bill, by the same code as the POS. No discount: only staff give one.
  // An area's fee_override replaces the restaurant's fee, exactly as in check-delivery and the POS.
  const billSettings: BillSettingsRow = { ...(restaurant as BillSettingsRow), ...(delivery ? { delivery_fee: delivery.fee } : {}) };
  const billed = computeBill(subtotalPence, kindForFulfilment(body.fulfilment_type), billSettings, null);
  if (!billed.ok) {
    console.error(`create-order: computeBill refused for ${body.restaurant_id}: ${billed.error}`);
    return reject(FEE_MISSING_SPEECH, billed.error, 500);
  }
  const { bill } = billed;

  timer.lap("price");

  // Read the order back so the caller can catch mistakes.
  const readBack = joinForSpeech(
    lines.map((l) => {
      const size = l.sizeName ? `${sizeForSpeech(l.sizeName)} ` : "";
      const opts = l.chosen.length ? ` with ${joinForSpeech(l.chosen.map(optionForSpeech))}` : "";
      return `${numberToWords(l.quantity)} ${size}${l.item.name.toLowerCase()}${opts}`;
    }),
  );
  const eta = isDelivery ? DELIVERY_ETA_MINUTES : PICKUP_ETA_MINUTES;
  const total = pounds(bill.totalPence);

  const when = scheduled ? ` for ${scheduled.spoken}` : "";

  const area = delivery?.area ?? null;
  const money = currencyFields(currency);

  if (body.preview) {
    const to = area ? area.label : formatPostcode(body.delivery_postcode ?? "");
    const how = isDelivery
      ? `for delivery to ${to}${when}. That comes to ${moneyForSpeech(total, currency)} in total${chargesForSpeech(bill, true, currency)}`
      : `for collection${when}. That comes to ${moneyForSpeech(total, currency)} in total${chargesForSpeech(bill, false, currency)}`;
    return NextResponse.json({
      success: true,
      preview: true,
      ...billForResponse(bill),
      ...money,
      delivery_area: area?.label ?? null,
      eta_minutes: eta,
      requested_time: scheduled ? scheduled.at.toISOString() : null,
      speech: `So that's ${readBack}, ${how}. Is that all correct?`,
    });
  }

  // Rule: one atomic insert of the order + all items.
  const { data: order, error: rpcError } = await supabaseAdmin.rpc("create_order_tx", {
    p_order: {
      restaurant_id: body.restaurant_id,
      call_id: body.call_id ?? null,
      fulfilment_type: body.fulfilment_type,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      // An area_list order keeps its area in the address line (what the kitchen and driver see); no postcode.
      delivery_address: isDelivery ? addressWithArea(body.delivery_address!, area) : null,
      delivery_postcode: isDelivery && !area ? formatPostcode(body.delivery_postcode!) : null,
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
      payment_method: body.payment_method,
      requested_time: scheduled ? scheduled.at.toISOString() : null,
      notes: body.notes ?? null,
      // Explicit: orders from this route are always phone orders.
      source: "phone",
    },
    p_items: toOrderItemsPayload(lines),
  });
  timer.lap("insert");

  if (rpcError || !order) {
    console.error("create-order: create_order_tx failed", rpcError);
    return reject(
      "Sorry, I couldn't place that order just now. Could you hold on a moment while I try again?",
      "order insert failed",
      500,
    );
  }

  // ECHO-BACK RULE: phone and postcode are read back from the row AS STORED,
  // so a copying mistake by the agent is heard by the caller. Items and total
  // were already read back (preview) and confirmed, so they aren't repeated.
  const saved = order as {
    order_number: string;
    customer_phone: string;
    delivery_postcode: string | null;
    requested_time: string | null;
  };
  const dest = area ? area.label : isDelivery ? postcodeForSpeech(saved.delivery_postcode!) : "";
  const where = scheduled
    ? isDelivery
      ? `delivering to ${dest}, that'll be with you for ${scheduled.spoken}`
      : `that'll be ready for ${scheduled.spoken}`
    : isDelivery
      ? `delivering to ${dest} in about ${eta} minutes`
      : `ready to collect in about ${eta} minutes`;

  return NextResponse.json({
    success: true,
    order_number: saved.order_number,
    ...billForResponse(bill),
    ...money,
    delivery_area: area?.label ?? null,
    eta_minutes: eta,
    requested_time: saved.requested_time,
    stored_phone: saved.customer_phone,
    stored_postcode: saved.delivery_postcode,
    speech: `Perfect, order number ${saved.order_number}, ${where}. We've got your number as ${phoneForSpeech(saved.customer_phone)}.`,
  });
});
