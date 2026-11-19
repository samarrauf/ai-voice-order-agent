import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: the party has left, free the table. Sets cleared_at = now on
// the session. A session that is already cleared can't be cleared again.
// Only a session of the logged-in restaurant can be cleared (others are 404).

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  table_session_id: z.guid(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid body: table_session_id must be a valid id", 400);
  const { table_session_id } = parsed.data;
  const mismatch = restaurantMismatch(parsed.data.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  // One atomic statement: only an OPEN session matches, so two staff pressing
  // "clear" together can't both succeed.
  const { data: cleared, error } = await supabaseAdmin
    .from("table_sessions")
    .update({ cleared_at: new Date().toISOString() })
    .eq("id", table_session_id)
    .eq("restaurant_id", rid)
    .is("cleared_at", null)
    .select("id, table_id, seated_at, cleared_at");
  if (error) {
    console.error("clear-table: update failed", error);
    return fail("could not clear the table", 500);
  }
  if (cleared && cleared.length > 0) return NextResponse.json({ success: true, session: cleared[0] });

  // Nothing updated: either it doesn't exist or it was already cleared.
  const { data: existing } = await supabaseAdmin.from("table_sessions").select("id").eq("id", table_session_id).eq("restaurant_id", rid).maybeSingle();
  return existing ? fail("table is already cleared", 409) : fail("table session not found", 404);
}
