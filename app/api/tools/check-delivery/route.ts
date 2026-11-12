import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { priceForSpeech } from "@/lib/speech";
import { DELIVERY_ETA_MINUTES, FEE_MISSING_SPEECH, inDeliveryArea } from "@/lib/delivery";
import { timed } from "@/lib/timing";

// Voice-agent tool: can we deliver to the caller's postcode?

const bodySchema = z.object({
  postcode: z.string().max(20),
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
});

const REFUSED_SPEECH =
  "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?";

export const POST = timed("check-delivery", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    return NextResponse.json(
      { error: "body must be { postcode: string, restaurant_id: uuid }", speech: "Sorry, could you tell me your postcode again?" },
      { status: 400 },
    );
  }

  if (!inDeliveryArea(parsed.data.postcode)) {
    return NextResponse.json({ deliverable: false, speech: REFUSED_SPEECH });
  }

  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("delivery_fee")
    .eq("id", parsed.data.restaurant_id)
    .maybeSingle();
  timer.lap("db");

  if (error || !data) {
    console.error("check-delivery: restaurant lookup failed", error);
    return NextResponse.json(
      { error: "restaurant not found", speech: "Sorry, I'm having trouble checking that right now." },
      { status: error ? 500 : 404 },
    );
  }

  // A missing fee is a configuration error, NOT free delivery.
  // Promising free delivery would cost the restaurant money on every order.
  if (data.delivery_fee === null) {
    console.error(
      `check-delivery: restaurants.delivery_fee is null for ${parsed.data.restaurant_id}; refusing to quote delivery`,
    );
    return NextResponse.json(
      { deliverable: false, error: "delivery_fee not configured", speech: FEE_MISSING_SPEECH },
      { status: 500 },
    );
  }

  const fee = Number(data.delivery_fee);
  const feeSpeech = fee > 0 ? `It's ${priceForSpeech(fee)} for delivery` : "Delivery is free";
  return NextResponse.json({
    deliverable: true,
    fee,
    eta_minutes: DELIVERY_ETA_MINUTES,
    speech: `Yes, we deliver there. ${feeSpeech}, about ${DELIVERY_ETA_MINUTES} minutes.`,
  });
});
