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
import { checkOpen, type OpeningHours } from "@/lib/opening-hours";
import { timed } from "@/lib/timing";

// Voice-agent tool: place an order.
//
// THE MONEY RULE: every price, subtotal and total is calculated here from the
// menu tables. Anything price-like in the request body is never read — zod
// strips unknown keys like "total" and "subtotal" before we touch the data.
// All arithmetic is done in whole pence to avoid floating-point errors.

const MAX_QTY = 20;

const itemSchema = z.object({
  menu_item_id: z.guid(),
  size_name: z.string().trim().max(50).nullish(),
  quantity: z.number().int().min(1).max(MAX_QTY),
  options: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  notes: z.string().trim().max(200).nullish(),
});

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
  notes: z.string().trim().max(500).nullish(),
  items: z.array(itemSchema).min(1).max(30),
});

type Body = z.infer<typeof bodySchema>;

type DbSize = { name: string; price: number | string; is_default: boolean };
type DbItem = {
  id: string;
  name: string;
  category_id: string | null;
  base_price: number | string;
  is_available: boolean;
  item_sizes: DbSize[];
};
type DbOption = {
  id: string;
  menu_item_id: string | null;
  category_id: string | null;
  group_name: string;
  name: string;
  price_delta: number | string;
  max_select: number;
  is_available: boolean;
};

const pence = (v: number | string) => Math.round(Number(v) * 100);
const pounds = (p: number) => p / 100;

/** 400 with a sentence the agent can read straight to the caller. */
function reject(speech: string, error: string, status = 400) {
  return NextResponse.json({ success: false, error, speech }, { status });
}

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

function optionForSpeech(o: DbOption): string {
  const name = o.name.toLowerCase();
  if (/topping/i.test(o.group_name) && !name.startsWith("extra")) return `extra ${name}`;
  if (/crust/i.test(o.group_name)) return `${name} crust`;
  return name;
}

function joinForSpeech(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
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
      .select("id, name, category_id, base_price, is_available, item_sizes ( name, price, is_default )")
      .eq("restaurant_id", body.restaurant_id)
      .in("id", itemIds),
    supabaseAdmin
      .from("item_options")
      .select("id, menu_item_id, category_id, group_name, name, price_delta, max_select, is_available")
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

  // Rule 2: open and accepting orders.
  if (!restaurant.is_accepting_orders) {
    return reject("Sorry, we're not taking any orders at the moment.", "restaurant not accepting orders");
  }
  const openCheck = checkOpen(restaurant.opening_hours as OpeningHours | null, restaurant.timezone ?? "Europe/London");
  if (!openCheck.open) {
    return reject(openCheck.speech, "restaurant closed");
  }

  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const allOptions = optionsRes.data as DbOption[];

  // Price every line from the database.
  const lines = [];
  for (const req of body.items) {
    const item = menuById.get(req.menu_item_id);
    if (!item) {
      return reject(
        "Sorry, I couldn't find one of those items on our menu. Could you tell me that item again?",
        `menu_item_id ${req.menu_item_id} not found for this restaurant`,
      );
    }
    // Rule 3: name the unavailable item.
    if (!item.is_available) {
      return reject(
        `Sorry, the ${item.name} isn't available right now. Would you like something else instead?`,
        `item unavailable: ${item.name}`,
      );
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
        return reject(
          `What size would you like the ${item.name}? We do ${choices}.`,
          `size "${req.size_name ?? ""}" not found for ${item.name}`,
        );
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
        return reject(
          `Sorry, we can't do ${raw.toLowerCase()} on the ${item.name}. Is it okay without?`,
          `option "${raw}" not valid for ${item.name}`,
        );
      }
      if (!opt.is_available) {
        return reject(
          `Sorry, ${opt.name.toLowerCase()} isn't available right now. Is the ${item.name} okay without it?`,
          `option unavailable: ${opt.name}`,
        );
      }
      chosen.push(opt);
    }
    // Respect max_select per option group (e.g. only one crust).
    const perGroup = new Map<string, number>();
    for (const o of chosen) perGroup.set(o.group_name, (perGroup.get(o.group_name) ?? 0) + 1);
    for (const [group, count] of perGroup) {
      const max = Math.min(...chosen.filter((o) => o.group_name === group).map((o) => o.max_select));
      if (count > max) {
        return reject(
          `Sorry, you can only choose ${numberToWords(max)} ${group.toLowerCase()} for the ${item.name}. Which would you like?`,
          `too many options in group ${group} for ${item.name}`,
        );
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

  const subtotalPence = lines.reduce((sum, l) => sum + l.linePence, 0);

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

  if (body.preview) {
    const how = isDelivery
      ? `for delivery to ${formatPostcode(body.delivery_postcode!)}. That comes to ${priceForSpeech(total)} in total, including ${priceForSpeech(pounds(deliveryFeePence))} delivery`
      : `for collection. That comes to ${priceForSpeech(total)} in total`;
    return NextResponse.json({
      success: true,
      preview: true,
      subtotal: pounds(subtotalPence),
      delivery_fee: pounds(deliveryFeePence),
      total,
      eta_minutes: eta,
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
      notes: body.notes ?? null,
    },
    p_items: lines.map((l) => ({
      menu_item_id: l.item.id,
      item_name: l.item.name,
      size_name: l.sizeName,
      options: l.chosen.map((o) => ({ id: o.id, group: o.group_name, name: o.name, price_delta: Number(o.price_delta) })),
      quantity: l.quantity,
      unit_price: pounds(l.unitPence),
      line_total: pounds(l.linePence),
      notes: l.notes,
    })),
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
  const saved = order as { order_number: string; customer_phone: string; delivery_postcode: string | null };
  const where = isDelivery
    ? `delivering to ${postcodeForSpeech(saved.delivery_postcode!)} in about ${eta} minutes`
    : `ready to collect in about ${eta} minutes`;

  return NextResponse.json({
    success: true,
    order_number: saved.order_number,
    subtotal: pounds(subtotalPence),
    delivery_fee: pounds(deliveryFeePence),
    total,
    eta_minutes: eta,
    stored_phone: saved.customer_phone,
    stored_postcode: saved.delivery_postcode,
    speech: `Perfect, order number ${saved.order_number}, ${where}. We've got your number as ${phoneForSpeech(saved.customer_phone)}.`,
  });
});
