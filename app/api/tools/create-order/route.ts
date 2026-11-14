import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  formatPostcode,
  normalizePhone,
  numberToWords,
  phoneForSpeech,
  postcodeForSpeech,
  priceForSpeech,
  sizeForSpeech,
} from "@/lib/speech";
import {
  DELIVERY_ETA_MINUTES,
  FEE_MISSING_SPEECH,
  PICKUP_ETA_MINUTES,
  inDeliveryArea,
} from "@/lib/delivery";
import { checkOpen, nextOpening, resolveRequestedTime, type OpeningHours } from "@/lib/opening-hours";
import { timed } from "@/lib/timing";
import {
  MAX_QTY,
  MENU_ITEM_SELECT,
  OPTION_SELECT,
  itemSchema,
  joinForSpeech,
  optionForSpeech,
  pence,
  pounds,
  priceLines,
  toOrderItemsPayload,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";

// Voice-agent tool: place an order.
//
// THE MONEY RULE: every price, subtotal and total is calculated here from the
// menu tables. Anything price-like in the request body is never read — zod
// strips unknown keys like "total" and "subtotal" before we touch the data.
// All arithmetic is done in whole pence to avoid floating-point errors.

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

  // Cheap checks that need no database first.
  if (isDelivery && !body.delivery_address) {
    return reject("What's the address for delivery?", "delivery_address required for delivery");
  }
  if (isDelivery && !body.delivery_postcode) {
    return reject("And what's the postcode for delivery?", "delivery_postcode required for delivery");
  }
  if (isDelivery && !inDeliveryArea(body.delivery_postcode!)) {
    return reject(
      "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?",
      "postcode outside delivery area",
    );
  }

  // Three queries, in parallel — no N+1.
  const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const [restaurantRes, itemsRes, optionsRes] = await Promise.all([
    supabaseAdmin
      .from("restaurants")
      .select("is_accepting_orders, opening_hours, timezone, delivery_fee, min_order_value")
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
  ]);
  timer.lap("db");

  if (restaurantRes.error || itemsRes.error || optionsRes.error) {
    console.error("create-order: lookup failed", restaurantRes.error ?? itemsRes.error ?? optionsRes.error);
    return reject("Sorry, I'm having trouble placing that order. Could you hold on a moment?", "database lookup failed", 500);
  }
  const restaurant = restaurantRes.data;
  if (!restaurant) {
    return reject("Sorry, I'm having trouble placing that order. Could you hold on a moment?", "restaurant not found", 404);
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

  let deliveryFeePence = 0;
  if (isDelivery) {
    // Rule 4: minimum order for delivery (on food, before the delivery fee).
    const minPence = restaurant.min_order_value === null ? 0 : pence(restaurant.min_order_value);
    if (subtotalPence < minPence) {
      const short = priceForSpeech(pounds(minPence - subtotalPence));
      return reject(
        `Sorry, the minimum for delivery is ${priceForSpeech(pounds(minPence))}. You need another ${short} to reach it. Would you like to add something, or collect instead?`,
        `below minimum order: short by ${short}`,
      );
    }
    // A missing fee is a configuration error, never free delivery.
    if (restaurant.delivery_fee === null) {
      console.error(`create-order: delivery_fee is null for ${body.restaurant_id}; refusing delivery order`);
      return reject(FEE_MISSING_SPEECH, "delivery_fee not configured", 500);
    }
    deliveryFeePence = pence(restaurant.delivery_fee);
  }
  const totalPence = subtotalPence + deliveryFeePence;

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
  const total = pounds(totalPence);

  const when = scheduled ? ` for ${scheduled.spoken}` : "";

  if (body.preview) {
    const how = isDelivery
      ? `for delivery to ${formatPostcode(body.delivery_postcode!)}${when}. That comes to ${priceForSpeech(total)} in total, including ${priceForSpeech(pounds(deliveryFeePence))} delivery`
      : `for collection${when}. That comes to ${priceForSpeech(total)} in total`;
    return NextResponse.json({
      success: true,
      preview: true,
      subtotal: pounds(subtotalPence),
      delivery_fee: pounds(deliveryFeePence),
      total,
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
      delivery_address: isDelivery ? body.delivery_address : null,
      delivery_postcode: isDelivery ? formatPostcode(body.delivery_postcode!) : null,
      subtotal: pounds(subtotalPence),
      delivery_fee: pounds(deliveryFeePence),
      total: pounds(totalPence),
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
  const where = scheduled
    ? isDelivery
      ? `delivering to ${postcodeForSpeech(saved.delivery_postcode!)}, that'll be with you for ${scheduled.spoken}`
      : `that'll be ready for ${scheduled.spoken}`
    : isDelivery
      ? `delivering to ${postcodeForSpeech(saved.delivery_postcode!)} in about ${eta} minutes`
      : `ready to collect in about ${eta} minutes`;

  return NextResponse.json({
    success: true,
    order_number: saved.order_number,
    subtotal: pounds(subtotalPence),
    delivery_fee: pounds(deliveryFeePence),
    total,
    eta_minutes: eta,
    requested_time: saved.requested_time,
    stored_phone: saved.customer_phone,
    stored_postcode: saved.delivery_postcode,
    speech: `Perfect, order number ${saved.order_number}, ${where}. We've got your number as ${phoneForSpeech(saved.customer_phone)}.`,
  });
});
