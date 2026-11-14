import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: seat a party at a table. Creates a table_sessions row
// (seated_at = now). With a booking_id it's a booked customer arriving
// (source 'booking'); without one it's a walk-in (source 'walk_in').
// A table that already has an open session (cleared_at is null) can't be seated again.

const bodySchema = z.object({
  restaurant_id: z.guid(),
  table_id: z.guid(),
  party_size: z.number().int().min(1).max(50),
  booking_id: z.guid().nullish(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const denied = requireDashboardSession(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const { restaurant_id, table_id, party_size, booking_id } = parsed.data;

  // Three independent lookups, in parallel.
  const [tableRes, openRes, bookingRes] = await Promise.all([
    supabaseAdmin.from("restaurant_tables").select("id").eq("id", table_id).eq("restaurant_id", restaurant_id).maybeSingle(),
    supabaseAdmin.from("table_sessions").select("id").eq("table_id", table_id).is("cleared_at", null).limit(1),
    booking_id
      ? supabaseAdmin.from("bookings").select("id, status").eq("id", booking_id).eq("restaurant_id", restaurant_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (tableRes.error || openRes.error || bookingRes.error) {
    console.error("seat-table: lookup failed", tableRes.error ?? openRes.error ?? bookingRes.error);
    return fail("database lookup failed", 500);
  }
  if (!tableRes.data) return fail("table not found for this restaurant", 404);
  if (booking_id && !bookingRes.data) return fail("booking not found for this restaurant", 404);
  if (bookingRes.data?.status === "cancelled") return fail("booking is cancelled", 409);
  if (openRes.data && openRes.data.length > 0) return fail("table is already occupied", 409);

  const { data: session, error } = await supabaseAdmin
    .from("table_sessions")
    .insert({
      restaurant_id,
      table_id,
      booking_id: booking_id ?? null,
      party_size,
      source: booking_id ? "booking" : "walk_in",
      seated_at: new Date().toISOString(),
    })
    .select("id, restaurant_id, table_id, booking_id, party_size, source, seated_at")
    .single();
  if (error || !session) {
    console.error("seat-table: insert failed", error);
    return fail("could not seat the table", 500);
  }
  return NextResponse.json({ success: true, session }, { status: 201 });
}
