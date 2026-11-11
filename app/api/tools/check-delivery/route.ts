import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { priceForSpeech } from "@/lib/speech";

// Voice-agent tool: can we deliver to the caller's postcode?

const bodySchema = z.object({
  postcode: z.string().max(20),
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
});

const ETA_MINUTES = 45;
const REFUSED_SPEECH =
  "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?";

/** "m14 5tp" -> "M14", "M1" -> "M1", "hello" -> "HELLO". */
function outwardCode(raw: string): string {
  const pc = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A full UK postcode ends in a 3-character inward code: digit + two letters.
  return /^[A-Z0-9]{2,4}\d[A-Z]{2}$/.test(pc) ? pc.slice(0, -3) : pc;
}

// TODO(geocoding): replace this hardcoded M1–M23 check with real geocoding.
// Look up the caller's postcode (e.g. postcodes.io), measure the distance
// to the restaurant's own postcode, and compare against
// restaurants.delivery_radius_miles.
function inDeliveryArea(outward: string): boolean {
  const m = /^M(\d{1,2})$/.exec(outward);
  if (!m) return false;
  const district = Number(m[1]);
  return district >= 1 && district <= 23;
}

export async function POST(request: Request) {
  const denied = requireToolSecret(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "body must be { postcode: string, restaurant_id: uuid }", speech: "Sorry, could you tell me your postcode again?" },
      { status: 400 },
    );
  }

  if (!inDeliveryArea(outwardCode(parsed.data.postcode))) {
    return NextResponse.json({ deliverable: false, speech: REFUSED_SPEECH });
  }

  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("delivery_fee")
    .eq("id", parsed.data.restaurant_id)
    .maybeSingle();

  if (error || !data) {
    console.error("check-delivery: restaurant lookup failed", error);
    return NextResponse.json(
      { error: "restaurant not found", speech: "Sorry, I'm having trouble checking that right now." },
      { status: error ? 500 : 404 },
    );
  }

  const fee = Number(data.delivery_fee ?? 0);
  const feeSpeech = fee > 0 ? `It's ${priceForSpeech(fee)} for delivery` : "Delivery is free";
  return NextResponse.json({
    deliverable: true,
    fee,
    eta_minutes: ETA_MINUTES,
    speech: `Yes, we deliver there. ${feeSpeech}, about ${ETA_MINUTES} minutes.`,
  });
}
