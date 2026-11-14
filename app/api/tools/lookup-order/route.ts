import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { findOrderForCaller, ORDER_NOT_FOUND_SPEECH } from "@/lib/order-lookup";
import { normalizePhone } from "@/lib/speech";
import { timed } from "@/lib/timing";

// Voice-agent tool: read-only summary of a past order, for a caller asking
// about it. The order number AND phone must both match (see lib/order-lookup.ts).
// Nothing is decided or changed here.

const bodySchema = z.object({
  restaurant_id: z.guid(),
  order_number: z.string().trim().min(1).max(20),
  customer_phone: z.string().transform(normalizePhone),
});

export const POST = timed("lookup-order", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid body", speech: "Sorry, could I have the order number and the phone number you ordered with?" },
      { status: 400 },
    );
  }

  const { restaurant_id, order_number, customer_phone } = parsed.data;
  let order;
  try {
    order = await findOrderForCaller(restaurant_id, order_number, customer_phone);
  } catch (e) {
    console.error("lookup-order: lookup failed", e);
    return NextResponse.json(
      { success: false, error: "lookup failed", speech: "Sorry, I couldn't look that up just now." },
      { status: 500 },
    );
  }
  timer.lap("db");

  // Same body for wrong number and wrong phone.
  if (!order) {
    return NextResponse.json({ success: false, error: "not_found", speech: ORDER_NOT_FOUND_SPEECH }, { status: 404 });
  }

  const date = new Date(order.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const itemsSpeech = order.items.map((i) => `${i.quantity} ${i.name}`).join(", ");
  return NextResponse.json({
    success: true,
    order: {
      order_number: order.order_number,
      date: order.created_at,
      items: order.items,
      total: order.total.toFixed(2),
      order_type: order.fulfilment_type,
      status: order.status,
    },
    speech: `I found your ${order.fulfilment_type} order from ${date}: ${itemsSpeech}. The total was ${order.total.toFixed(2)}. Its status is ${order.status}.`,
  });
});
