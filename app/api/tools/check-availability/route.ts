import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  CLOSED_AT_THAT_TIME_SPEECH,
  bookingDateSchema,
  bookingTimeSchema,
  checkBookingHours,
  dateForSpeech,
  partyForSpeech,
  partySizeSchema,
  timeForBookingSpeech,
} from "@/lib/booking";
import { timed } from "@/lib/timing";

// Voice-agent tool: is there a free table for this party at this date and time?
//
// This is only a courtesy check so the agent can tell the caller early. It
// reserves nothing, and create-booking never trusts it: the real check
// happens again inside create_booking_tx, under a lock.
// TODO: suggest alternative times when nothing is free (planned, not built yet).

const bodySchema = z.object({
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
  date: bookingDateSchema,
  time: bookingTimeSchema,
  party_size: partySizeSchema,
});

export const POST = timed("check-availability", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => i.path.join("."));
    const speech = paths.includes("date")
      ? "Sorry, which date would you like to book for?"
      : paths.includes("time")
        ? "Sorry, what time would you like the table for?"
        : paths.includes("party_size")
          ? "Sorry, how many people is the table for?"
          : "Sorry, could you tell me that again?";
    return NextResponse.json(
      { available: false, error: `invalid body: ${paths.join(", ") || "missing"}`, speech },
      { status: 400 },
    );
  }

  const { restaurant_id, date, time, party_size } = parsed.data;

  // Two independent lookups, run together. The SQL function applies the
  // 90-minute rule, same as create_booking_tx.
  const [hours, { data: table, error }] = await Promise.all([
    checkBookingHours(restaurant_id, date, time),
    supabaseAdmin
      .rpc("find_free_table", {
        p_restaurant_id: restaurant_id,
        p_date: date,
        p_time: time,
        p_party_size: party_size,
      })
      .maybeSingle(),
  ]);
  timer.lap("db");

  if (error || hours === "error" || hours === "not_found") {
    if (error) console.error("check-availability: find_free_table failed", error);
    return NextResponse.json(
      { available: false, error: hours === "not_found" ? "restaurant not found" : "lookup failed", speech: "Sorry, I'm having trouble checking the tables right now." },
      { status: hours === "not_found" ? 404 : 500 },
    );
  }

  // Outside opening hours: no table, whatever the dining room looks like.
  if (hours === "closed") {
    return NextResponse.json({ available: false, reason: "closed", speech: CLOSED_AT_THAT_TIME_SPEECH });
  }

  const when = `${dateForSpeech(date)} at ${timeForBookingSpeech(time)}`;
  if (!table) {
    return NextResponse.json({
      available: false,
      speech: `Sorry, we don't have a table for ${partyForSpeech(party_size)} on ${when}.`,
    });
  }

  return NextResponse.json({
    available: true,
    speech: `Yes, we have a table for ${partyForSpeech(party_size)} on ${when}.`,
  });
});
