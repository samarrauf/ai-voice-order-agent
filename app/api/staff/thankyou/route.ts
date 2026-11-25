import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadThankYouSettings, thankYouAllowed, thankYouFor, type ThankYouOrder } from "@/lib/thankyou";
import { normalizePkPhone } from "@/lib/whatsapp-link";

// B4d: the WhatsApp "thank you + Google review" button. Nothing is sent from here:
// the browser opens the wa.me link and staff press Send in WhatsApp themselves.
// Capability send_thankyou (every staff role). The restaurant comes from the login.
//
//   { action: "message",   order_id }                 -> the text, the phone and the wa.me link
//   { action: "set_phone", order_id, customer_phone } -> saves the number (normalised) on the order
//   { action: "clicked",   order_id }                 -> order_events row 'thankyou_clicked'
//
// The message is always built here from the database (the order, the restaurant's
// private review link and template); the browser sends only the order id.
// Cancelled and merged orders: 409, no button.

const orderRef = { restaurant_id: z.guid().optional(), order_id: z.guid() };
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), ...orderRef }),
  z.object({ action: z.literal("set_phone"), ...orderRef, customer_phone: z.string().max(30) }),
  z.object({ action: z.literal("clicked"), ...orderRef }),
]);

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const ORDER_SELECT = "id, order_number, customer_name, customer_phone, total, status";

export async function POST(request: Request) {
  const auth = await requireCapability(request, "send_thankyou");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid request", 400);
  const body = parsed.data;
  const mismatch = restaurantMismatch(body.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  const found = await supabaseAdmin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", body.order_id)
    .eq("restaurant_id", rid)
    .maybeSingle();
  if (found.error) {
    console.error("thankyou: could not read the order", found.error);
    return fail("could not load the order", 500);
  }
  if (!found.data) return fail("order not found", 404);
  let order = found.data as ThankYouOrder & { id: string };
  if (!thankYouAllowed(order.status)) return fail("this order is cancelled or merged", 409);

  if (body.action === "clicked") {
    const ev = await supabaseAdmin.from("order_events").insert({
      restaurant_id: rid,
      order_id: order.id,
      staff_id: staffId,
      event: "thankyou_clicked",
      detail: { has_phone: normalizePkPhone(order.customer_phone) !== null },
    });
    if (ev.error) {
      console.error("thankyou: could not write the click", ev.error);
      return fail("could not save", 500);
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "set_phone") {
    const phone = normalizePkPhone(body.customer_phone);
    if (!phone) return fail("invalid phone: use a mobile number like 0300 1234567", 400);
    const up = await supabaseAdmin
      .from("orders")
      .update({ customer_phone: phone })
      .eq("id", order.id)
      .eq("restaurant_id", rid)
      .select(ORDER_SELECT)
      .maybeSingle();
    if (up.error || !up.data) {
      console.error("thankyou: could not save the phone", up.error);
      return fail("could not save the phone", 500);
    }
    order = up.data as ThankYouOrder & { id: string };
  }

  const settings = await loadThankYouSettings(rid);
  if (!settings) return fail("could not load the restaurant", 500);
  const t = thankYouFor(order, settings);
  return NextResponse.json({
    success: true,
    text: t.text,
    customer_phone: t.phone,
    url: t.url,
    has_review_link: t.hasReviewLink,
  });
}
