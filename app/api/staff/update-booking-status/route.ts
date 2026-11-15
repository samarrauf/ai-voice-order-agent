import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { requireDashboardSession } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: change a booking's status from the dashboard Bookings tab.
//
//   confirmed -> seated | cancelled | no_show
//   seated    -> completed
//
// Cancelled, completed and no_show are final: nothing moves a booking out of
// them, and nothing ever sets a booking back to "confirmed".
//
// Nothing from the request body is trusted beyond the booking id and the wanted
// status: the booking's restaurant and CURRENT status are read from the database
// on every call. The dashboard belongs to one restaurant for now (CLAUDE.md,
// "Dashboard auth"), so a booking of any other restaurant is "not found".
//
// "seated" is only allowed once the booking really has an open table session
// (the Seat now button calls /api/staff/seat-table first), so a booking can't be
// marked seated without a table. Clearing the table on "completed" stays in
// /api/staff/clear-table; the dashboard calls that one.

const STATUSES = ["seated", "completed", "cancelled", "no_show"] as const;

const ALLOWED_FROM: Record<(typeof STATUSES)[number], string[]> = {
  seated: ["confirmed"],
  cancelled: ["confirmed"],
  no_show: ["confirmed"],
  completed: ["seated"],
};

const bodySchema = z.object({
  booking_id: z.guid(),
  status: z.enum(STATUSES),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const denied = requireDashboardSession(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: booking_id must be a valid id and status one of ${STATUSES.join(", ")}`, 400);
  }
  const { booking_id, status } = parsed.data;

  const { data: booking, error: lookupError } = await supabaseAdmin
    .from("bookings")
    .select("id, status")
    .eq("id", booking_id)
    .eq("restaurant_id", DEMO_RESTAURANT_ID)
    .maybeSingle();
  if (lookupError) {
    console.error("update-booking-status: lookup failed", lookupError);
    return fail("database lookup failed", 500);
  }
  if (!booking) return fail("booking not found", 404);

  if (!ALLOWED_FROM[status].includes(booking.status)) {
    return fail(`a ${booking.status} booking can't be changed to ${status}`, 409);
  }

  if (status === "seated") {
    const { data: open, error: openError } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("booking_id", booking_id)
      .is("cleared_at", null)
      .limit(1);
    if (openError) {
      console.error("update-booking-status: session lookup failed", openError);
      return fail("database lookup failed", 500);
    }
    if (!open || open.length === 0) return fail("seat the booking at a table first", 409);
  }

  // One atomic statement: only matches if the status is STILL what we just read,
  // so two staff pressing buttons at once can't both win.
  const { data: updated, error } = await supabaseAdmin
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", booking_id)
    .eq("restaurant_id", DEMO_RESTAURANT_ID)
    .eq("status", booking.status)
    .select("id, booking_reference, status");
  if (error) {
    console.error("update-booking-status: update failed", error);
    return fail("could not update the booking", 500);
  }
  if (!updated || updated.length === 0) return fail("the booking was just changed by someone else, refresh and try again", 409);
  return NextResponse.json({ success: true, booking: updated[0] });
}
