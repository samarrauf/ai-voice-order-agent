import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currencyFields, moneyForSpeech } from "@/lib/speech";
import {
  AREA_MISSING_SPEECH,
  AREA_NOT_LISTED_SPEECH,
  DELIVERY_AREA_SELECT,
  DELIVERY_ETA_MINUTES,
  FEE_MISSING_SPEECH,
  NO_DELIVERY_SPEECH,
  OUTSIDE_POSTCODE_SPEECH,
  decideDelivery,
  deliveryModeOf,
  type DeliveryAreaRow,
  type DeliveryRefusal,
} from "@/lib/delivery";
import { timed } from "@/lib/timing";
import { deliveryFeePence, pounds } from "@/lib/order-pricing";

// Voice-agent tool: can we deliver to the caller? How depends on the
// restaurant's delivery_mode (migration 0022, rules in lib/delivery.ts):
//   'postcode'  = the caller's postcode (exactly as before 0022)
//   'area_list' = the area the caller names, matched against delivery_areas
//   'none'      = we don't deliver

const bodySchema = z.object({
  postcode: z.string().max(20).optional(),
  // area_list restaurants: the area as the caller said it.
  area: z.string().max(80).optional(),
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
});

const BAD_POSTCODE = { error: "body must be { postcode: string, restaurant_id: uuid }", speech: "Sorry, could you tell me your postcode again?" };

const REFUSAL_SPEECH: Record<Exclude<DeliveryRefusal, "postcode_missing">, string> = {
  outside_postcode: OUTSIDE_POSTCODE_SPEECH,
  area_missing: AREA_MISSING_SPEECH,
  area_not_listed: AREA_NOT_LISTED_SPEECH,
  no_delivery: NO_DELIVERY_SPEECH,
};

export const POST = timed("check-delivery", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    return NextResponse.json(BAD_POSTCODE, { status: 400 });
  }
  const rid = parsed.data.restaurant_id;

  // Two queries, in parallel: the restaurant and its active delivery areas.
  const [restaurantRes, areasRes] = await Promise.all([
    supabaseAdmin.from("restaurants").select("delivery_fee, delivery_mode, currency").eq("id", rid).maybeSingle(),
    supabaseAdmin.from("delivery_areas").select(DELIVERY_AREA_SELECT).eq("restaurant_id", rid).eq("is_active", true),
  ]);
  timer.lap("db");

  const data = restaurantRes.data;
  if (restaurantRes.error || areasRes.error || !data) {
    console.error("check-delivery: restaurant lookup failed", restaurantRes.error ?? areasRes.error);
    return NextResponse.json(
      { error: "restaurant not found", speech: "Sorry, I'm having trouble checking that right now." },
      { status: restaurantRes.error || areasRes.error ? 500 : 404 },
    );
  }

  const mode = deliveryModeOf(data.delivery_mode);
  const money = currencyFields(data.currency);
  const where = parsed.data;
  // Postcode mode needs a postcode, as before. (An area_list caller's words may
  // arrive in either field, so both are tried.)
  if (mode === "postcode" && where.postcode === undefined) {
    return NextResponse.json(BAD_POSTCODE, { status: 400 });
  }
  const decision = decideDelivery(
    mode,
    { postcode: where.postcode, area: where.area ?? where.postcode },
    (areasRes.data ?? []) as DeliveryAreaRow[],
    data.delivery_fee,
  );
  if (!decision.ok) {
    // postcode_missing: an empty postcode string; refused like any postcode we don't cover.
    const reason = decision.reason === "postcode_missing" ? "outside_postcode" : decision.reason;
    return NextResponse.json({ deliverable: false, delivery_mode: mode, reason, ...money, speech: REFUSAL_SPEECH[reason] });
  }

  // A missing fee is a configuration error, NOT free delivery.
  // Promising free delivery would cost the restaurant money on every order.
  // Read through the same helper computeBill uses, so the fee quoted here is
  // exactly the fee create_order and the POS charge (an area's fee_override
  // is passed to both the same way).
  const feeRes = deliveryFeePence(decision.fee);
  if (!feeRes.ok) {
    console.error(
      `check-delivery: delivery fee (${feeRes.error}) for ${rid}; refusing to quote delivery`,
    );
    return NextResponse.json(
      { deliverable: false, error: feeRes.error, speech: FEE_MISSING_SPEECH },
      { status: 500 },
    );
  }

  const fee = pounds(feeRes.pence);
  const feeSpeech = fee > 0 ? `It's ${moneyForSpeech(fee, money.currency)} for delivery` : "Delivery is free";
  const there = decision.area ? `to ${decision.area.label}` : "there";
  return NextResponse.json({
    deliverable: true,
    fee,
    eta_minutes: DELIVERY_ETA_MINUTES,
    delivery_mode: mode,
    area: decision.area?.label ?? null,
    ...money,
    speech: `Yes, we deliver ${there}. ${feeSpeech}, about ${DELIVERY_ETA_MINUTES} minutes.`,
  });
});
