import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isRealName, isRealPhone } from "@/lib/caller-details";
import {
  CLOSED_AT_THAT_TIME_SPEECH,
  bookingDateSchema,
  bookingTimeSchema,
  checkBookingHours,
  dateForSpeech,
  partyForSpeech,
  partySizeSchema,
  referenceForSpeech,
  timeForBookingSpeech,
} from "@/lib/booking";
import { normalizePhone, phoneForSpeech } from "@/lib/speech";
import { timed } from "@/lib/timing";

// Voice-agent tool: book a table.
//
// The table is chosen and the booking saved by create_booking_tx in ONE
// transaction, under a lock, re-checking availability at insert time. Nothing
// from an earlier check-availability call is trusted, so two simultaneous
// callers can never end up with the same table.
//
// ECHO-BACK RULE: the speech reads back the details as STORED, so a mistake
// made while copying the caller's words is heard and corrected.

const bodySchema = z.object({
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
  date: bookingDateSchema,
  time: bookingTimeSchema,
  party_size: partySizeSchema,
  // JUNK GUARD (shared with request-callback): no "Unknown" / "0000000000".
  customer_name: z.string().trim().min(1).max(100).refine(isRealName),
  customer_phone: z.string().transform(normalizePhone).refine(isRealPhone),
  menu_preferences: z.string().trim().max(300).nullish(),
});

const SAVE_FAILED_SPEECH = "Sorry, I couldn't save that booking just now. Could you ring the shop back in a few minutes?";

export const POST = timed("create-booking", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => i.path.join("."));
    const speech = paths.includes("customer_name")
      ? "Sorry, could I take your name for the booking?"
      : paths.includes("customer_phone")
        ? "Sorry, could I take a contact number for the booking?"
        : paths.includes("date")
          ? "Sorry, which date would you like to book for?"
          : paths.includes("time")
            ? "Sorry, what time would you like the table for?"
            : paths.includes("party_size")
              ? "Sorry, how many people is the table for?"
              : "Sorry, could you tell me that again?";
    return NextResponse.json(
      { success: false, error: `invalid body: ${paths.join(", ") || "missing"}`, speech },
      { status: 400 },
    );
  }

  const { restaurant_id, date, time, party_size, customer_name, customer_phone, menu_preferences } = parsed.data;

  // Outside opening hours: refuse before touching the bookings table.
  const hours = await checkBookingHours(restaurant_id, date, time);
  timer.lap("hours");
  if (hours === "not_found" || hours === "error") {
    return NextResponse.json(
      { success: false, error: hours === "not_found" ? "restaurant not found" : "lookup failed", speech: SAVE_FAILED_SPEECH },
      { status: hours === "not_found" ? 404 : 500 },
    );
  }
  if (hours === "closed") {
    return NextResponse.json(
      { success: false, available: false, reason: "closed", speech: CLOSED_AT_THAT_TIME_SPEECH },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("create_booking_tx", {
    p_restaurant_id: restaurant_id,
    p_date: date,
    p_time: time,
    p_party_size: party_size,
    p_customer_name: customer_name,
    p_customer_phone: customer_phone,
    p_menu_preferences: menu_preferences ?? null,
  });
  timer.lap("db");

  if (error || !data) {
    console.error("create-booking: create_booking_tx failed", error);
    return NextResponse.json({ success: false, error: "booking failed", speech: SAVE_FAILED_SPEECH }, { status: 500 });
  }

  const result = data as
    | { success: true; booking_reference: string; table_number: string; booking_date: string; booking_time: string }
    | { success: false; reason: "no_table" | "party_too_large" };

  const when = `${dateForSpeech(date)} at ${timeForBookingSpeech(time)}`;
  if (!result.success) {
    // 409 = well-formed request, but it conflicts with existing bookings. Not a server error.
    const speech =
      result.reason === "party_too_large"
        ? `Sorry, we don't have a table big enough for ${partyForSpeech(party_size)}. Could I take your number so the team can ring you back about it?`
        : `Sorry, we don't have a table for ${partyForSpeech(party_size)} on ${when}.`;
    return NextResponse.json({ success: false, available: false, reason: result.reason, speech }, { status: 409 });
  }

  const firstName = customer_name.split(/\s+/)[0];
  return NextResponse.json({
    success: true,
    booking_reference: result.booking_reference,
    table_number: result.table_number,
    booking_date: result.booking_date,
    booking_time: result.booking_time,
    stored_phone: customer_phone,
    // Built from the STORED values, never from the request.
    speech:
      `That's booked, ${firstName}. A table for ${partyForSpeech(party_size)} on ${when}. ` +
      `Your booking reference is ${referenceForSpeech(result.booking_reference)}. ` +
      `We have your number as ${phoneForSpeech(customer_phone)}. Is that right?`,
  });
});
